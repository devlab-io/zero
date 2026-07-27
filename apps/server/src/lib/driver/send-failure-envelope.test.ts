// send-failure-envelope.test.ts — la chaîne d'échec d'un envoi, du fournisseur au verdict.
//
// Ce fichier existe parce que deux corrections successives ont été réfutées pour le MÊME
// vice : un test qui fabrique une forme d'erreur que la production ne produit jamais
// (`Object.assign(new Error('rate'), { code: 429 })`). Ici rien n'est fabriqué :
//
//   1. l'erreur est une VRAIE `GaxiosError` du paquet installé (gaxios 6.7.1, atteint par
//      la réexportation `google-auth-library` — même instance que celle d'@googleapis/gmail,
//      une seule version dans le store pnpm) ;
//   2. elle traverse la VRAIE enveloppe de production : `GmailTransport.withErrorHandler`,
//      donc le vrai `StandardizedError` — celui de `./utils`, non mocké ici ;
//   3. le verdict est rendu par les vraies fonctions de classement, puis injecté dans le
//      vrai `deliverScheduledEmail`.
//
// Il couvre en outre l'étage que les deux réfutations précédentes n'avaient pas vu : entre
// le driver et le consommateur de la file d'envoi différé il y a une frontière RPC de
// Durable Object, et une erreur JETÉE n'y survit pas. Mesuré sur workerd (miniflare
// 4.20250816, local) : côté appelant, propriétés propres `['stack','message','remote']`,
// `name === 'Error'`, `message === 'StandardizedError: Too Many Requests'`. Ni `code`, ni
// `status`, ni `errors`, ni `cause`, ni prototype. `acrossDurableObjectRpc` ci-dessous
// reproduit exactement cette réduction, et le test qui l'emploie est la raison d'être de
// `attemptScheduledSend` : classer DANS le DO, et ne faire traverser que le verdict.

import {
  classifySendFailure,
  describeSendFailure,
  fromScheduledSendAttempt,
  settledOutcomeFor,
  type ScheduledSendAttemptRpcResult,
} from '../send-reservation';
import {
  envelopedSendFailure,
  envelopedTransportFailure,
  gmailHttpFailure,
  gmailTransportFailure,
} from './__fixtures__/send-failure';
import { deliverScheduledEmail, attemptScheduledSend } from '../scheduled-send';
import { describe, expect, it, vi } from 'vitest';

// Seule couture neutralisée : `../../env` (→ `cloudflare:workers`), dont le transport a
// besoin pour construire son client OAuth. `./utils` — donc `StandardizedError` — reste le
// module de production.
vi.mock('../../env', () => ({
  env: { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', NODE_ENV: 'test' },
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { GmailTransport } = await import('./google-transport');

const transport = new GmailTransport({ auth: { email: 'a@b.co', refreshToken: 'r' } } as never);

// --- Erreurs de production ------------------------------------------------------------
//
// Les constructeurs d'erreur vivent dans `./__fixtures__/send-failure`, partagés avec
// `send-reservation.test.ts` et `scheduled-send.test.ts` : une seule définition de ce
// qu'est une erreur d'envoi réelle, donc aucun endroit où une fixture mensongère puisse
// repousser. Ce fichier-ci est celui qui PROUVE que ces fixtures sont fidèles, en faisant
// tourner le vrai transport.

/** Fait passer l'erreur par l'enveloppe de production et rend ce qui en sort. */
async function throughEnvelope(raw: unknown, operation = 'sendDraft'): Promise<unknown> {
  try {
    await transport.withErrorHandler(operation, async () => {
      throw raw;
    });
  } catch (enveloped) {
    return enveloped;
  }
  throw new Error('withErrorHandler n’a rien levé');
}

/**
 * Réduction MESURÉE qu'inflige la frontière RPC d'un Durable Object à une erreur jetée.
 * Aucune propriété propre ne survit ; le message est préfixé du nom de la classe.
 */
function acrossDurableObjectRpc(error: unknown): Error {
  const source = error as Error;
  return new Error(`${source.name}: ${source.message}`);
}

// --- La prémisse, vérifiée sur le paquet installé -------------------------------------

describe('gaxios 6.7.1 — ce que porte réellement une erreur Gmail', () => {
  it('un verdict HTTP porte `status` et AUCUN `code`', () => {
    const raw = gmailHttpFailure(429);
    expect(raw.status).toBe(429);
    expect(raw.code).toBeUndefined();
  });

  it('une panne de transport porte `code` et AUCUN `status`', () => {
    const raw = gmailTransportFailure();
    expect(raw.code).toBe('ECONNRESET');
    expect(raw.status).toBeUndefined();
  });
});

// --- L'enveloppe -----------------------------------------------------------------------

describe('withErrorHandler — l’enveloppe ne jette plus le verdict du fournisseur', () => {
  it('conserve le statut HTTP', async () => {
    const enveloped = (await throughEnvelope(gmailHttpFailure(429))) as { status?: number };
    expect(enveloped).toBeInstanceOf(Error);
    expect((enveloped as Error).name).toBe('StandardizedError');
    expect(enveloped.status).toBe(429);
  });

  it('conserve les motifs de quota nichés dans la réponse', async () => {
    const enveloped = (await throughEnvelope(gmailHttpFailure(403, ['userRateLimitExceeded']))) as {
      response?: { data?: { error?: { errors?: { reason?: string }[] } } };
    };
    expect(enveloped.response?.data?.error?.errors).toEqual([{ reason: 'userRateLimitExceeded' }]);
  });

  it('conserve le code de transport et chaîne la cause', async () => {
    const enveloped = (await throughEnvelope(gmailTransportFailure())) as {
      code?: string;
      status?: number;
      cause?: unknown;
    };
    expect(enveloped.code).toBe('ECONNRESET');
    expect(enveloped.status).toBeUndefined();
    expect(enveloped.cause).toBeInstanceOf(Error);
  });

  // C'est CE test qui autorise `send-reservation.test.ts` et `scheduled-send.test.ts` à
  // employer le raccourci `envelopedSendFailure(...)` sans monter le transport : il établit
  // que le raccourci et le vrai chemin produisent la même valeur observable. Si un jour
  // `withErrorHandler` cessait de jeter un `StandardizedError`, ou l'enrichissait
  // autrement, ce test tomberait le premier — et les fixtures partagées redeviendraient
  // suspectes au lieu de mentir en silence.
  it.each([400, 403, 429, 503])(
    'le raccourci partagé `envelopedSendFailure(%i)` est FIDÈLE au vrai chemin',
    async (status) => {
      const reasons = status === 403 ? ['userRateLimitExceeded'] : [];
      const real = (await throughEnvelope(gmailHttpFailure(status, reasons))) as Error;
      const shortcut = envelopedSendFailure(status, reasons);

      expect(shortcut.constructor).toBe(real.constructor);
      expect(shortcut.name).toBe(real.name);
      expect(shortcut.message).toBe(real.message);
      expect(shortcut.status).toBe((real as { status?: number }).status);
      expect(shortcut.code).toBe((real as { code?: string }).code);
      expect(shortcut.response).toEqual((real as { response?: unknown }).response);
      // Et surtout : le verdict rendu est le même des deux côtés.
      expect(classifySendFailure(shortcut)).toBe(classifySendFailure(real));
      expect(describeSendFailure(shortcut)).toBe(describeSendFailure(real));
    },
  );

  it('le raccourci de panne de transport est fidèle lui aussi', async () => {
    const real = (await throughEnvelope(gmailTransportFailure())) as Error;
    const shortcut = envelopedTransportFailure();
    expect(shortcut.code).toBe((real as { code?: string }).code);
    expect(shortcut.status).toBeUndefined();
    expect(classifySendFailure(shortcut)).toBe(classifySendFailure(real));
    expect(describeSendFailure(shortcut)).toBe(describeSendFailure(real));
  });
});

// --- Le classement, sur la sortie de l'enveloppe ---------------------------------------

describe('classifySendFailure — sur l’enveloppe RÉELLE, plus sur une fixture', () => {
  // Les dix statuts que l'auditeur a mesurés : tous rendaient `ambiguous`, donc
  // `not-accepted-retryable` et `not-accepted-permanent` étaient du code mort.
  const expected: Record<number, string> = {
    400: 'not-accepted-permanent',
    401: 'not-accepted-permanent',
    403: 'not-accepted-permanent',
    404: 'not-accepted-permanent',
    408: 'not-accepted-retryable',
    413: 'not-accepted-permanent',
    422: 'not-accepted-permanent',
    429: 'not-accepted-retryable',
    500: 'ambiguous',
    503: 'ambiguous',
  };

  it.each(Object.keys(expected).map(Number))('un %i est classé sur son statut', async (status) => {
    const enveloped = await throughEnvelope(gmailHttpFailure(status));
    expect(classifySendFailure(enveloped)).toBe(expected[status]);
    expect(describeSendFailure(enveloped)).toBe(`http-${status}`);
  });

  it('un 403 de quota redevient rejouable, un 403 de permission reste définitif', async () => {
    const quota = await throughEnvelope(gmailHttpFailure(403, ['userRateLimitExceeded']));
    expect(classifySendFailure(quota)).toBe('not-accepted-retryable');

    const forbidden = await throughEnvelope(gmailHttpFailure(403, ['forbidden']));
    expect(classifySendFailure(forbidden)).toBe('not-accepted-permanent');
  });

  it('une panne de transport reste AMBIGUË : Gmail a pu accepter avant la coupure', async () => {
    const enveloped = await throughEnvelope(gmailTransportFailure());
    expect(classifySendFailure(enveloped)).toBe('ambiguous');
    expect(describeSendFailure(enveloped)).toBe('transport-failure');
    expect(settledOutcomeFor(classifySendFailure(enveloped))).toBe('unresolved');
  });
});

// --- La frontière RPC : pourquoi le verdict doit être rendu dans le DO ------------------

describe('frontière RPC du Durable Object — une erreur JETÉE n’y survit pas', () => {
  it('l’enveloppe la mieux remplie redevient ambiguë après la traversée', async () => {
    const enveloped = await throughEnvelope(gmailHttpFailure(429));
    expect(classifySendFailure(enveloped)).toBe('not-accepted-retryable');

    const arrived = acrossDurableObjectRpc(enveloped);
    // C'est l'étage que les deux réfutations précédentes n'avaient pas vu : corriger
    // `StandardizedError` seul aurait laissé le chemin d'envoi différé exactement aussi
    // aveugle qu'avant.
    expect((arrived as { status?: number }).status).toBeUndefined();
    expect(classifySendFailure(arrived)).toBe('ambiguous');
  });

  it('le VERDICT, lui, traverse : c’est une valeur, pas une erreur', async () => {
    const enveloped = await throughEnvelope(gmailHttpFailure(429));
    const attempt = await attemptScheduledSend(
      {
        create: vi.fn(async () => {
          throw enveloped;
        }),
        sendDraft: vi.fn(async () => {
          throw enveloped;
        }),
      } as never,
      { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' } as never,
    );

    // Sérialisable au sens de la frontière : structuredClone est ce que fait le runtime
    // d'une valeur de retour RPC.
    const crossed = structuredClone(attempt) as ScheduledSendAttemptRpcResult;
    expect(crossed).toEqual({
      ok: false,
      failureClass: 'not-accepted-retryable',
      detail: 'http-429',
      message: 'Request failed with status code 429',
    });
    expect(classifySendFailure(fromScheduledSendAttempt(crossed))).toBe('not-accepted-retryable');
    expect(describeSendFailure(fromScheduledSendAttempt(crossed))).toBe('http-429');
  });

  it('un envoi réussi rend `ok` et n’invente aucun verdict', async () => {
    const attempt = await attemptScheduledSend(
      { create: vi.fn(async () => ({ id: 'm1' })), sendDraft: vi.fn() } as never,
      { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' } as never,
    );
    expect(attempt).toEqual({ ok: true, failureClass: null, detail: null, message: null });
  });

  it('un driver absent est un échec AVANT émission, donc rejouable', async () => {
    const attempt = await attemptScheduledSend(null, {} as never);
    expect(attempt).toMatchObject({ ok: false, failureClass: 'not-accepted-retryable' });
  });
});

// --- Bout en bout : la vraie erreur, la vraie enveloppe, la vraie livraison -------------

const BODY = { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M', headers: {} };
const silentLogger = { info: vi.fn(), error: vi.fn() };

function makeStore(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    get: async (k: string) => map.get(k) ?? null,
    put: async (k: string, v: string) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  };
}

/**
 * Reproduit le chemin de production complet : le driver lève la vraie erreur, le DO la
 * classe (`attemptScheduledSend`), le verdict traverse (`structuredClone`), l'appelant le
 * rehausse (`fromScheduledSendAttempt`) et `deliverScheduledEmail` décide.
 */
async function deliverThrough(raw: unknown, messageId: string) {
  const enveloped = await throughEnvelope(raw);
  const statusKV = makeStore();
  const payloadKV = makeStore();
  const retry = vi.fn();
  const settled: Array<{ outcome: string; detail?: string }> = [];

  const out = await deliverScheduledEmail(
    { messageId, connectionId: 'c', mail: BODY as never },
    {
      statusKV,
      payloadKV,
      reservation: {
        reserve: async () => ({ action: 'reserve' as const, reason: 'first-arrival' as const }),
        settle: async (_id, outcome, _now, detail) => void settled.push({ outcome, detail }),
      },
      send: async () => {
        const attempt = await attemptScheduledSend(
          {
            create: async () => {
              throw enveloped;
            },
            sendDraft: async () => {
              throw enveloped;
            },
          } as never,
          BODY as never,
        );
        if (!attempt.ok) {
          throw fromScheduledSendAttempt(structuredClone(attempt) as ScheduledSendAttemptRpcResult);
        }
      },
      retry,
      logger: silentLogger,
    },
  );

  return { out, retry, settled, statusKV };
}

describe('deliverScheduledEmail — nourri par la vraie chaîne d’erreur', () => {
  it('un 429 de Gmail est REJOUÉ (il ne l’était jamais)', async () => {
    const { out, retry, settled, statusKV } = await deliverThrough(gmailHttpFailure(429), 'e-429');
    expect(out).toMatchObject({ outcome: 'failed', retried: true });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(settled).toEqual([{ outcome: 'failed', detail: 'http-429' }]);
    expect(statusKV.map.get('e-429')).toBe('failed');
  });

  it('un 403 de quota est REJOUÉ', async () => {
    const { out, retry, settled } = await deliverThrough(
      gmailHttpFailure(403, ['userRateLimitExceeded']),
      'e-403q',
    );
    expect(out).toMatchObject({ outcome: 'failed', retried: true });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(settled).toEqual([{ outcome: 'failed', detail: 'http-403' }]);
  });

  it('un 400 est DÉFINITIF : réglé `failed`, jamais rejoué', async () => {
    const { out, retry, settled } = await deliverThrough(gmailHttpFailure(400), 'e-400');
    expect(out).toMatchObject({ outcome: 'failed', retried: false });
    expect(retry).not.toHaveBeenCalled();
    expect(settled).toEqual([{ outcome: 'failed', detail: 'http-400' }]);
  });

  it('une panne de transport reste AMBIGUË : jamais rejouée, réglée `unresolved`', async () => {
    const { out, retry, settled, statusKV } = await deliverThrough(
      gmailTransportFailure(),
      'e-net',
    );
    expect(out).toMatchObject({ outcome: 'unresolved' });
    expect(retry).not.toHaveBeenCalled();
    expect(settled).toEqual([{ outcome: 'unresolved', detail: 'transport-failure' }]);
    expect(statusKV.map.get('e-net')).toBe('unresolved');
  });

  it('un 503 reste AMBIGU : Gmail a reçu la requête', async () => {
    const { out, retry, settled } = await deliverThrough(gmailHttpFailure(503), 'e-503');
    expect(out).toMatchObject({ outcome: 'unresolved' });
    expect(retry).not.toHaveBeenCalled();
    expect(settled).toEqual([{ outcome: 'unresolved', detail: 'http-503' }]);
  });
});
