import {
  classifySendFailure,
  decideSendReservation,
  describeSendFailure,
  ScheduledSendPayloadError,
  SendNotDispatchedError,
  settledOutcomeFor,
  shouldRetryAfter,
  type SendReservationRecord,
} from './send-reservation';
import { isRetryableGmailError } from './driver/gmail-backoff';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Décision pure de réservation — aux bornes, comme history-lock.ts.
// ---------------------------------------------------------------------------

describe('decideSendReservation', () => {
  it('réserve à la première arrivée', () => {
    expect(decideSendReservation(undefined)).toEqual({
      action: 'reserve',
      reason: 'first-arrival',
    });
  });

  it('refuse une réservation en vol', () => {
    const existing: SendReservationRecord = { status: 'sending', reservedAt: 0 };
    expect(decideSendReservation(existing)).toEqual({ action: 'skip', reason: 'in-flight' });
  });

  it('N’A AUCUNE PÉREMPTION : une réservation en vol reste bloquante indéfiniment', () => {
    // Différence assumée avec `decideHistoryLockAction`, qui reprend un verrou périmé après
    // une heure. Reprendre une réservation d'ENVOI reviendrait à renvoyer un mail dont
    // l'issue est inconnue : le doublon est plus coûteux que le blocage, et le blocage est
    // visible (procédure de lecture + capture Sentry).
    const ancient: SendReservationRecord = { status: 'sending', reservedAt: 0 };
    for (const age of [1, 3600_000, 24 * 3600_000, 365 * 24 * 3600_000, Number.MAX_SAFE_INTEGER]) {
      expect(decideSendReservation(ancient)).toEqual({ action: 'skip', reason: 'in-flight' });
      expect(age).toBeGreaterThan(0);
    }
  });

  it('refuse un message déjà parti', () => {
    const existing: SendReservationRecord = { status: 'settled', outcome: 'sent', settledAt: 1 };
    expect(decideSendReservation(existing)).toEqual({ action: 'skip', reason: 'already-sent' });
  });

  it('refuse un message dont l’issue est AMBIGUË', () => {
    const existing: SendReservationRecord = {
      status: 'settled',
      outcome: 'unresolved',
      settledAt: 1,
    };
    expect(decideSendReservation(existing)).toEqual({
      action: 'skip',
      reason: 'unresolved-outcome',
    });
  });

  it('rouvre un message dont la NON-ACCEPTATION est prouvée', () => {
    const existing: SendReservationRecord = { status: 'settled', outcome: 'failed', settledAt: 1 };
    expect(decideSendReservation(existing)).toEqual({
      action: 'reserve',
      reason: 'retry-after-proven-failure',
    });
  });
});

// ---------------------------------------------------------------------------
// Classification de l'issue — le cœur de la réfutation (c).
// ---------------------------------------------------------------------------

describe('classifySendFailure — ne rejouer que ce qui prouve la non-acceptation', () => {
  it('une panne de TRANSPORT est ambiguë, pas un échec franc', () => {
    // La contradiction exacte relevée par l'audit : `gmail-backoff` classe `fetch failed`
    // comme transitoire (correct pour une LECTURE idempotente), et `scheduled-send`
    // rejouait sur cette base — donc le mail partait deux fois quand Gmail avait accepté
    // la requête avant que la socket ne tombe.
    const transport = new TypeError('fetch failed');
    expect(isRetryableGmailError(transport)).toBe(true); // le classifieur de lecture
    expect(classifySendFailure(transport)).toBe('ambiguous'); // celui d'écriture
    expect(shouldRetryAfter(classifySendFailure(transport))).toBe(false);
  });

  it('un timeout client est ambigu', () => {
    const timeout = new Error('request timed out');
    expect(isRetryableGmailError(timeout)).toBe(true);
    expect(classifySendFailure(timeout)).toBe('ambiguous');
  });

  it('ECONNRESET après émission est ambigu', () => {
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(classifySendFailure(reset)).toBe('ambiguous');
  });

  it.each([500, 502, 503, 504])('un %i est ambigu : Gmail a reçu la requête', (status) => {
    expect(classifySendFailure(Object.assign(new Error('boom'), { code: status }))).toBe(
      'ambiguous',
    );
  });

  it('une erreur sans forme identifiable est ambiguë', () => {
    expect(classifySendFailure(new Error('gmail 500'))).toBe('ambiguous');
    expect(classifySendFailure('boom')).toBe('ambiguous');
    expect(classifySendFailure(null)).toBe('ambiguous');
    expect(classifySendFailure(undefined)).toBe('ambiguous');
  });

  it('un 429 PROUVE le refus et est transitoire : rejouable', () => {
    const err = Object.assign(new Error('rate limited'), { code: 429 });
    expect(classifySendFailure(err)).toBe('not-accepted-retryable');
    expect(shouldRetryAfter(classifySendFailure(err))).toBe(true);
  });

  it('un 408 PROUVE que la requête n’a pas été traitée : rejouable', () => {
    expect(classifySendFailure({ status: 408 })).toBe('not-accepted-retryable');
  });

  it('un 403 de quota est rejouable, un 403 de permission ne l’est pas', () => {
    const quota = { code: 403, errors: [{ reason: 'userRateLimitExceeded' }] };
    expect(classifySendFailure(quota)).toBe('not-accepted-retryable');

    const forbidden = { code: 403, errors: [{ reason: 'forbidden' }] };
    expect(classifySendFailure(forbidden)).toBe('not-accepted-permanent');
    expect(shouldRetryAfter(classifySendFailure(forbidden))).toBe(false);
  });

  it('un 403 de quota niché dans response.data est reconnu', () => {
    const nested = {
      code: 403,
      response: { data: { error: { errors: [{ reason: 'quotaExceeded' }] } } },
    };
    expect(classifySendFailure(nested)).toBe('not-accepted-retryable');
  });

  it.each([400, 401, 404, 413, 422])(
    'un %i est une non-acceptation PROUVÉE mais définitive : jamais rejouée',
    (status) => {
      const cls = classifySendFailure({ code: status });
      expect(cls).toBe('not-accepted-permanent');
      // Rejouer un refus déterministe brûlerait les cinq tentatives de la queue sans
      // aucune chance d'aboutir, et il n'y a pas de dead-letter queue.
      expect(shouldRetryAfter(cls)).toBe(false);
    },
  );

  it('un échec AVANT émission est rejouable, pas ambigu', () => {
    // Sans ce marqueur, une panne transitoire du Durable Object porteur de l'agent (donc
    // AVANT tout appel Gmail) tombait dans « erreur non identifiable » -> ambiguë -> mail
    // bloqué définitivement, alors que rien n'avait jamais été tenté.
    const err = new SendNotDispatchedError('failed to resolve mail agent', {
      cause: new Error('DO unreachable'),
    });
    expect(classifySendFailure(err)).toBe('not-accepted-retryable');
    expect(shouldRetryAfter(classifySendFailure(err))).toBe(true);
    expect(settledOutcomeFor(classifySendFailure(err))).toBe('failed');
    expect(describeSendFailure(err)).toBe('not-dispatched');
  });

  it('la même erreur SANS le marqueur reste ambiguë', () => {
    // Preuve que le marqueur est bien ce qui fait la différence : c'est l'appelant, seul à
    // savoir où il en était dans sa séquence, qui l'appose.
    expect(classifySendFailure(new Error('DO unreachable'))).toBe('ambiguous');
  });

  it('un payload irrécupérable est un échec définitif, jamais ambigu', () => {
    const err = new ScheduledSendPayloadError('bad json');
    expect(classifySendFailure(err)).toBe('not-accepted-permanent');
    expect(shouldRetryAfter(classifySendFailure(err))).toBe(false);
  });

  it('un 4xx déterministe ne se requalifie pas en panne réseau à cause de son libellé', () => {
    // `terminated` et `fetch failed` sont des motifs réseau ; un statut serveur prime.
    const err = { code: 400, message: 'fetch failed while terminated' };
    expect(classifySendFailure(err)).toBe('not-accepted-permanent');
  });
});

describe('settledOutcomeFor', () => {
  it('l’ambiguïté devient `unresolved`, la preuve devient `failed`', () => {
    expect(settledOutcomeFor('ambiguous')).toBe('unresolved');
    expect(settledOutcomeFor('not-accepted-permanent')).toBe('failed');
    expect(settledOutcomeFor('not-accepted-retryable')).toBe('failed');
  });

  it('seule une issue `failed` est rejouable — cohérence avec la décision de réservation', () => {
    for (const outcome of ['sent', 'unresolved'] as const) {
      expect(decideSendReservation({ status: 'settled', outcome, settledAt: 0 }).action).toBe(
        'skip',
      );
    }
    expect(
      decideSendReservation({ status: 'settled', outcome: 'failed', settledAt: 0 }).action,
    ).toBe('reserve');
  });
});

describe('describeSendFailure — la trace exigée par une issue ambiguë', () => {
  it('nomme le statut, le transport, ou l’inconnu', () => {
    expect(describeSendFailure({ code: 503 })).toBe('http-503');
    expect(describeSendFailure(new TypeError('fetch failed'))).toBe('transport-failure');
    expect(describeSendFailure(new Error('mystère'))).toBe('unknown-error');
    expect(describeSendFailure(new ScheduledSendPayloadError('x'))).toBe('payload-unrecoverable');
  });
});
