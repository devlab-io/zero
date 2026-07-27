import {
  cancelTtlSeconds,
  deliverScheduledEmail,
  isNonSendableStatus,
  MAX_KV_TTL_SECONDS,
  MAX_QUEUE_DELAY_SECONDS,
  MAX_SCHEDULE_AHEAD_SECONDS,
  MIN_KV_TTL_SECONDS,
  normalizeStoredAttachments,
  parseStoredPayload,
  scheduleTtlSeconds,
  SEND_TTL_GRACE_SECONDS,
  TERMINAL_MARKER_TTL_SECONDS,
  type ScheduledSendStore,
  type SendReservationGate,
  type StoredOutgoingMessage,
} from './scheduled-send';
import {
  envelopedSendFailure,
  envelopedTransportFailure,
} from './driver/__fixtures__/send-failure';
import { ScheduledSendPayloadError, type SettledSendOutcome } from './send-reservation';
import { describe, expect, it, vi } from 'vitest';

function makeStore(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const puts: Array<{ key: string; value: string; ttl?: number }> = [];
  const store: ScheduledSendStore & {
    map: Map<string, string>;
    puts: typeof puts;
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  } = {
    map,
    puts,
    get: vi.fn(async (k: string) => map.get(k) ?? null),
    put: vi.fn(async (k: string, v: string, o?: { expirationTtl?: number }) => {
      map.set(k, v);
      puts.push({ key: k, value: v, ttl: o?.expirationTtl });
    }),
    delete: vi.fn(async (k: string) => void map.delete(k)),
  };
  return store;
}

/**
 * Verrou toujours ouvert. Il ne SIMULE PAS l'exclusion mutuelle : ces tests-ci portent sur
 * les autres branches de `deliverScheduledEmail`. L'exclusion elle-même est prouvée dans
 * routes/agent/shard-registry.test.ts, contre le vrai Durable Object et un vrai SQLite.
 */
function openGate(): SendReservationGate & {
  settled: Array<{ messageId: string; outcome: SettledSendOutcome; detail?: string }>;
} {
  const settled: Array<{ messageId: string; outcome: SettledSendOutcome; detail?: string }> = [];
  return {
    settled,
    reserve: async () => ({ action: 'reserve' as const, reason: 'first-arrival' as const }),
    settle: async (messageId, outcome, _now, detail) => {
      settled.push({ messageId, outcome, detail });
    },
  };
}

const silentLogger = { info: vi.fn(), error: vi.fn() };

const BODY: StoredOutgoingMessage = {
  to: [{ email: 'x@y.co' }],
  subject: 'S',
  message: 'M',
  headers: {},
};

// ---------------------------------------------------------------------------
// P1 — TTL : le corps du mail doit survivre jusqu'a son echeance.
// ---------------------------------------------------------------------------

describe('scheduleTtlSeconds — le corps survit a la planification (P1)', () => {
  it('un envoi a 7 jours obtient un TTL > 7 jours, pas les 24 h codees en dur', () => {
    const sevenDays = 7 * 24 * 3600;
    const ttl = scheduleTtlSeconds(sevenDays);
    expect(ttl).toBe(sevenDays + SEND_TTL_GRACE_SECONDS);
    // La regression exacte : le corps etait ecrit avec 60*60*24 et disparaissait
    // six jours avant l'echeance.
    expect(ttl).toBeGreaterThan(60 * 60 * 24);
  });

  it('la marge couvre un cron ou une queue en retard', () => {
    expect(scheduleTtlSeconds(0)).toBeGreaterThanOrEqual(SEND_TTL_GRACE_SECONDS);
  });

  it('respecte le plancher et le plafond de KV', () => {
    expect(scheduleTtlSeconds(-5)).toBeGreaterThanOrEqual(MIN_KV_TTL_SECONDS);
    expect(scheduleTtlSeconds(10 * 365 * 24 * 3600)).toBe(MAX_KV_TTL_SECONDS);
    expect(scheduleTtlSeconds(Number.NaN)).toBeGreaterThanOrEqual(MIN_KV_TTL_SECONDS);
  });

  it('un envoi differe court (undo-send 15 s) reste au-dessus du plancher KV', () => {
    expect(scheduleTtlSeconds(15)).toBeGreaterThanOrEqual(MIN_KV_TTL_SECONDS);
  });
});

describe('cancelTtlSeconds — une annulation ne doit pas expirer avant l’echeance', () => {
  it('couvre l’echeance planifiee connue', () => {
    const now = 1_000_000_000_000;
    const sendAt = now + 5 * 24 * 3600 * 1000;
    expect(cancelTtlSeconds(sendAt, now)).toBe(5 * 24 * 3600 + SEND_TTL_GRACE_SECONDS);
  });

  it('sans echeance connue, couvre le delai de file maximal (12 h)', () => {
    expect(cancelTtlSeconds(undefined, Date.now())).toBe(
      MAX_QUEUE_DELAY_SECONDS + SEND_TTL_GRACE_SECONDS,
    );
  });

  it('dans tous les cas, depasse l’ancienne fenetre d’une heure', () => {
    expect(cancelTtlSeconds(undefined, Date.now())).toBeGreaterThan(60 * 60);
  });
});

describe('MAX_SCHEDULE_AHEAD_SECONDS — la borne haute de planification', () => {
  it('laisse la marge sous le plafond KV, sans quoi le corps expire avant l’echeance', () => {
    expect(MAX_SCHEDULE_AHEAD_SECONDS).toBe(MAX_KV_TTL_SECONDS - SEND_TTL_GRACE_SECONDS);
    // Le cas limite que la borne ferme : a l'echeance maximale acceptee, le TTL calcule
    // est encore EGAL a l'echeance + marge, donc il n'est pas rabote par le plafond.
    expect(scheduleTtlSeconds(MAX_SCHEDULE_AHEAD_SECONDS)).toBe(MAX_KV_TTL_SECONDS);
    // Un cran au-dela, il l'est : le corps disparait avant que le cron ne remette en file.
    expect(scheduleTtlSeconds(MAX_SCHEDULE_AHEAD_SECONDS + 1)).toBe(MAX_KV_TTL_SECONDS);
    expect(MAX_SCHEDULE_AHEAD_SECONDS + 1 + SEND_TTL_GRACE_SECONDS).toBeGreaterThan(
      MAX_KV_TTL_SECONDS,
    );
  });

  it('verrouille le « 365 jours » annonce par le message d’erreur de mail.send', () => {
    // Le motif de refus est une chaine litterale (le client garde un type exploitable) ;
    // ce test est ce qui empeche la borne et son libelle de diverger en silence.
    expect(Math.floor(MAX_SCHEDULE_AHEAD_SECONDS / 86_400)).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// Corps illisible : echec DEFINITIF, jamais rejoue (point 5).
// ---------------------------------------------------------------------------

describe('parseStoredPayload — une donnee irrecuperable ne doit pas boucler', () => {
  it('un JSON corrompu devient une ScheduledSendPayloadError', () => {
    expect(() => parseStoredPayload('{not json')).toThrow(ScheduledSendPayloadError);
  });

  it('un JSON valide mais non-objet est rejete', () => {
    expect(() => parseStoredPayload('"chaine"')).toThrow(ScheduledSendPayloadError);
    expect(() => parseStoredPayload('null')).toThrow(ScheduledSendPayloadError);
    expect(() => parseStoredPayload('[1,2]')).toThrow(ScheduledSendPayloadError);
  });

  it('`attachments:[null]` et `attachments:[{}]` sont captures, pas propages bruts', () => {
    // Meme famille que le JSON corrompu : `normalizeStoredAttachments` levait, hors de
    // tout try, et faisait rejouer le LOT entier de send-email-queue.
    expect(() => parseStoredPayload(JSON.stringify({ ...BODY, attachments: [null] }))).toThrow(
      ScheduledSendPayloadError,
    );
    expect(() => parseStoredPayload(JSON.stringify({ ...BODY, attachments: [{}] }))).toThrow(
      ScheduledSendPayloadError,
    );
  });

  it('un corps sain traverse et rehydrate ses pieces jointes', () => {
    const parsed = parseStoredPayload(
      JSON.stringify({
        ...BODY,
        attachments: [{ name: 'a.txt', type: 'text/plain', base64: 'aGk=' }],
      }),
    );
    const rehydrated = parsed.attachments ?? [];
    expect(rehydrated).toHaveLength(1);
    expect('arrayBuffer' in (rehydrated[0] as object)).toBe(true);
  });
});

describe('deliverScheduledEmail — corps illisible (point 5)', () => {
  it('un payload KV corrompu est un echec DEFINITIF : pas de rejeu', async () => {
    const statusKV = makeStore({ 'bad-1': 'pending' });
    const payloadKV = makeStore({ 'bad-1': '{ this is not json' });
    const send = vi.fn(async () => {});
    const retry = vi.fn();

    const out = await deliverScheduledEmail(
      { messageId: 'bad-1', connectionId: 'c' },
      { statusKV, payloadKV, reservation: openGate(), send, retry, logger: silentLogger },
    );

    expect(out).toMatchObject({ outcome: 'invalid-payload' });
    expect(send).not.toHaveBeenCalled();
    // La regression exacte : sans dead-letter queue, rejouer produisait cinq tentatives
    // identiques, et avec Promise.all cela relancait tout le lot a chaque fois.
    expect(retry).not.toHaveBeenCalled();
    expect(statusKV.map.get('bad-1')).toBe('failed');
  });

  it('`attachments:[null]` ne rejoue pas non plus', async () => {
    const retry = vi.fn();
    const out = await deliverScheduledEmail(
      { messageId: 'bad-2', connectionId: 'c' },
      {
        statusKV: makeStore(),
        payloadKV: makeStore({ 'bad-2': JSON.stringify({ ...BODY, attachments: [null] }) }),
        reservation: openGate(),
        send: vi.fn(async () => {}),
        retry,
        logger: silentLogger,
      },
    );
    expect(out).toMatchObject({ outcome: 'invalid-payload' });
    expect(retry).not.toHaveBeenCalled();
  });

  it('un corps illisible PORTE PAR LA QUEUE est traite pareil, sans lever', async () => {
    const retry = vi.fn();
    const out = await deliverScheduledEmail(
      {
        messageId: 'bad-3',
        connectionId: 'c',
        mail: { ...BODY, attachments: [null] } as unknown as StoredOutgoingMessage,
      },
      {
        statusKV: makeStore(),
        payloadKV: makeStore(),
        reservation: openGate(),
        send: vi.fn(async () => {}),
        retry,
        logger: silentLogger,
      },
    );
    expect(out).toMatchObject({ outcome: 'invalid-payload' });
    expect(retry).not.toHaveBeenCalled();
  });

  it('un corps illisible est CAPTURE, pas seulement journalise', async () => {
    const capture = vi.fn();
    await deliverScheduledEmail(
      { messageId: 'bad-4', connectionId: 'conn-x' },
      {
        statusKV: makeStore(),
        payloadKV: makeStore({ 'bad-4': 'nope' }),
        reservation: openGate(),
        send: vi.fn(async () => {}),
        capture,
        logger: silentLogger,
      },
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1]).toMatchObject({
      transaction: 'scheduled-send',
      extra: expect.objectContaining({ messageId: 'bad-4', connectionId: 'conn-x' }),
    });
  });
});

// ---------------------------------------------------------------------------
// Payload absent : echec explicite, plus d'acquittement muet.
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail — payload absent', () => {
  it('ecrit `failed` et rejoue au lieu d’acquitter en silence', async () => {
    const statusKV = makeStore({ 'msg-1': 'pending' });
    const payloadKV = makeStore();
    const send = vi.fn(async () => {});
    const retry = vi.fn();

    const out = await deliverScheduledEmail(
      { messageId: 'msg-1', connectionId: 'conn-1' },
      { statusKV, payloadKV, reservation: openGate(), send, retry, logger: silentLogger },
    );

    expect(out).toEqual({ outcome: 'missing-payload' });
    expect(send).not.toHaveBeenCalled();
    expect(statusKV.map.get('msg-1')).toBe('failed');
    // Rejoue : KV est eventuellement coherent, le corps peut apparaitre a la tentative
    // suivante. C'est la seule branche « absence » ou le rejeu a un sens.
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('la marque `failed` porte un TTL (pas de clef immortelle)', async () => {
    const statusKV = makeStore({ 'msg-1': 'pending' });
    await deliverScheduledEmail(
      { messageId: 'msg-1', connectionId: 'conn-1' },
      {
        statusKV,
        payloadKV: makeStore(),
        reservation: openGate(),
        send: vi.fn(async () => {}),
        logger: silentLogger,
      },
    );
    expect(statusKV.puts.at(-1)?.ttl).toBe(TERMINAL_MARKER_TTL_SECONDS);
  });

  it('un payload absent est CAPTURE', async () => {
    const capture = vi.fn();
    await deliverScheduledEmail(
      { messageId: 'msg-1b', connectionId: 'conn-1' },
      {
        statusKV: makeStore(),
        payloadKV: makeStore(),
        reservation: openGate(),
        send: vi.fn(async () => {}),
        capture,
        logger: silentLogger,
      },
    );
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Reservation : le verrou est celui du Durable Object, pas KV.
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail — la reservation commande l’envoi', () => {
  it('reserve AVANT d’appeler le driver', async () => {
    const order: string[] = [];
    const reservation: SendReservationGate = {
      reserve: async () => {
        order.push('reserve');
        return { action: 'reserve', reason: 'first-arrival' };
      },
      settle: async () => void order.push('settle'),
    };
    await deliverScheduledEmail(
      { messageId: 'msg-2', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore({ 'msg-2': 'pending' }),
        payloadKV: makeStore(),
        reservation,
        send: vi.fn(async () => void order.push('send')),
        logger: silentLogger,
      },
    );
    expect(order).toEqual(['reserve', 'send', 'settle']);
  });

  it('un refus de reservation n’envoie RIEN et rapporte le motif', async () => {
    const send = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-2b', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore(),
        payloadKV: makeStore(),
        reservation: {
          reserve: async () => ({ action: 'skip', reason: 'in-flight' }),
          settle: async () => {},
        },
        send,
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'skipped', status: 'in-flight' });
    expect(send).not.toHaveBeenCalled();
  });

  it('la reservation est consultee meme quand KV ne dit rien', async () => {
    const reserve = vi.fn(async () => ({
      action: 'skip' as const,
      reason: 'already-sent' as const,
    }));
    const send = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-2c', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore(),
        payloadKV: makeStore(),
        reservation: { reserve, settle: async () => {} },
        send,
        logger: silentLogger,
      },
    );
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ outcome: 'skipped', status: 'already-sent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('l’issue est reglee dans la reservation AVANT la surface KV', async () => {
    const gate = openGate();
    const statusKV = makeStore();
    await deliverScheduledEmail(
      { messageId: 'msg-2d', connectionId: 'c', mail: BODY },
      {
        statusKV,
        payloadKV: makeStore(),
        reservation: gate,
        send: vi.fn(async () => {}),
        logger: silentLogger,
      },
    );
    expect(gate.settled).toEqual([{ messageId: 'msg-2d', outcome: 'sent', detail: 'ok' }]);
    expect(statusKV.map.get('msg-2d')).toBe('sent');
  });
});

// ---------------------------------------------------------------------------
// Rejeu : uniquement sur une non-acceptation PROUVEE (refutation c).
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail — rejeu apres echec', () => {
  const failWith = async (error: unknown, messageId: string) => {
    const statusKV = makeStore({ [messageId]: 'pending' });
    const payloadKV = makeStore({ [messageId]: JSON.stringify(BODY) });
    const retry = vi.fn();
    const capture = vi.fn();
    const gate = openGate();
    const out = await deliverScheduledEmail(
      { messageId, connectionId: 'c' },
      {
        statusKV,
        payloadKV,
        reservation: gate,
        send: vi.fn(async () => {
          throw error;
        }),
        retry,
        capture,
        logger: silentLogger,
      },
    );
    return { out, retry, capture, statusKV, payloadKV, gate };
  };

  it('une panne de TRANSPORT ne rejoue PAS : le mail a pu partir', async () => {
    const { out, retry, statusKV, gate } = await failWith(envelopedTransportFailure(), 'amb-1');
    // La regression exacte, refutation (c) : `fetch failed` etait classe transitoire par
    // gmail-backoff, donc `scheduled-send` remettait `failed` et rejouait — et le mail
    // partait deux fois quand Gmail avait accepte la requete avant la coupure.
    expect(out).toMatchObject({ outcome: 'unresolved' });
    expect(retry).not.toHaveBeenCalled();
    expect(statusKV.map.get('amb-1')).toBe('unresolved');
    expect(gate.settled).toEqual([
      { messageId: 'amb-1', outcome: 'unresolved', detail: 'transport-failure' },
    ]);
  });

  it('un timeout ne rejoue pas', async () => {
    const { out, retry } = await failWith(envelopedTransportFailure('ETIMEDOUT'), 'amb-2');
    expect(out).toMatchObject({ outcome: 'unresolved' });
    expect(retry).not.toHaveBeenCalled();
  });

  it('un 5xx ne rejoue pas : Gmail a recu la requete', async () => {
    const { out, retry, gate } = await failWith(envelopedSendFailure(503), 'amb-3');
    expect(out).toMatchObject({ outcome: 'unresolved' });
    expect(retry).not.toHaveBeenCalled();
    expect(gate.settled[0]).toMatchObject({ outcome: 'unresolved', detail: 'http-503' });
  });

  it('une issue ambigue est CAPTUREE et conserve le corps', async () => {
    const { capture, payloadKV } = await failWith(envelopedTransportFailure(), 'amb-4');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(payloadKV.map.has('amb-4')).toBe(true);
  });

  it('un 429 (refus PROUVE, transitoire) rejoue', async () => {
    const { out, retry, statusKV } = await failWith(envelopedSendFailure(429), 'ret-1');
    expect(out).toMatchObject({ outcome: 'failed', retried: true });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(statusKV.map.get('ret-1')).toBe('failed');
  });

  it('un 400 (refus PROUVE, definitif) ne rejoue pas mais reste `failed`', async () => {
    const { out, retry, statusKV, payloadKV } = await failWith(envelopedSendFailure(400), 'perm-1');
    expect(out).toMatchObject({ outcome: 'failed', retried: false });
    expect(retry).not.toHaveBeenCalled();
    expect(statusKV.map.get('perm-1')).toBe('failed');
    // Le corps est conserve : c'est le mail de l'utilisateur.
    expect(payloadKV.map.has('perm-1')).toBe(true);
  });

  it('tout echec d’envoi est CAPTURE', async () => {
    const { capture } = await failWith(envelopedSendFailure(400), 'perm-2');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1]).toMatchObject({
      extra: expect.objectContaining({ failureClass: 'not-accepted-permanent' }),
    });
  });
});

// ---------------------------------------------------------------------------
// Une ecriture KV en echec ne doit plus faire disparaitre le mail (point 3).
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail — une ecriture KV en echec ne perd plus le mail', () => {
  function brokenPut(seed: Record<string, string> = {}): ScheduledSendStore & {
    map: Map<string, string>;
  } {
    const map = new Map<string, string>(Object.entries(seed));
    return {
      map,
      get: async (k) => map.get(k) ?? null,
      put: async () => {
        throw new Error('KV unavailable');
      },
      delete: async (k) => void map.delete(k),
    };
  }

  it('un `put(failed)` en echec ne fait plus SORTIR l’exception', async () => {
    const gate = openGate();
    const capture = vi.fn();
    // La regression exacte : l'exception sortait de la fonction, l'etat restait `sending`,
    // et toute redelivrance repondait `skipped` — le mail disparaissait sans trace.
    const out = await deliverScheduledEmail(
      { messageId: 'kv-1', connectionId: 'c', mail: BODY },
      {
        statusKV: brokenPut(),
        payloadKV: makeStore(),
        reservation: gate,
        send: vi.fn(async () => {
          throw envelopedSendFailure(429);
        }),
        capture,
        logger: silentLogger,
      },
    );
    expect(out).toMatchObject({ outcome: 'failed' });
    // L'issue authentique est dans la reservation, pas dans KV.
    expect(gate.settled).toEqual([{ messageId: 'kv-1', outcome: 'failed', detail: 'http-429' }]);
    // Et l'echec d'ecriture est signale au lieu d'etre subi.
    expect(capture.mock.calls.some(([, ctx]) => ctx.extra?.phase === 'status-write')).toBe(true);
  });

  it('un `put(sent)` en echec ne fait pas echouer un envoi reussi', async () => {
    const gate = openGate();
    const out = await deliverScheduledEmail(
      { messageId: 'kv-2', connectionId: 'c', mail: BODY },
      {
        statusKV: brokenPut(),
        payloadKV: makeStore(),
        reservation: gate,
        send: vi.fn(async () => {}),
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'sent' });
    expect(gate.settled).toEqual([{ messageId: 'kv-2', outcome: 'sent', detail: 'ok' }]);
  });

  it('un `settle` en echec est capture, et la reservation reste fermee (jamais de doublon)', async () => {
    const capture = vi.fn();
    const out = await deliverScheduledEmail(
      { messageId: 'kv-3', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore(),
        payloadKV: makeStore(),
        reservation: {
          reserve: async () => ({ action: 'reserve', reason: 'first-arrival' }),
          settle: async () => {
            throw new Error('DO unreachable');
          },
        },
        send: vi.fn(async () => {}),
        capture,
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'sent' });
    expect(capture.mock.calls.some(([, ctx]) => ctx.extra?.phase === 'reservation-settle')).toBe(
      true,
    );
  });

  it('une suppression de corps en echec ne fait pas echouer l’envoi', async () => {
    const payloadKV: ScheduledSendStore = {
      get: async () => JSON.stringify(BODY),
      put: async () => {},
      delete: async () => {
        throw new Error('KV delete failed');
      },
    };
    const out = await deliverScheduledEmail(
      { messageId: 'kv-4', connectionId: 'c' },
      {
        statusKV: makeStore(),
        payloadKV,
        reservation: openGate(),
        send: vi.fn(async () => {}),
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'sent' });
  });

  it('un `capture` qui leve ne casse pas le handler', async () => {
    const out = await deliverScheduledEmail(
      { messageId: 'kv-5', connectionId: 'c' },
      {
        statusKV: makeStore(),
        payloadKV: makeStore(),
        reservation: openGate(),
        send: vi.fn(async () => {}),
        capture: () => {
          throw new Error('sentry down');
        },
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'missing-payload' });
  });
});

// ---------------------------------------------------------------------------
// Pre-filtre KV et statuts.
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail — pre-filtre des statuts', () => {
  it('conserve le rejet de `cancelled` deja en place', async () => {
    const send = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-7', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore({ 'msg-7': 'cancelled' }),
        payloadKV: makeStore(),
        reservation: openGate(),
        send,
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'skipped', status: 'cancelled' });
    expect(send).not.toHaveBeenCalled();
  });

  it('`unresolved` bloque toute nouvelle tentative', async () => {
    const send = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-7b', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore({ 'msg-7b': 'unresolved' }),
        payloadKV: makeStore(),
        reservation: openGate(),
        send,
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'skipped', status: 'unresolved' });
    expect(send).not.toHaveBeenCalled();
  });

  it('apres un echec PROUVE, le message redevient envoyable', async () => {
    const send = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-9', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore({ 'msg-9': 'failed' }),
        payloadKV: makeStore(),
        reservation: openGate(),
        send,
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'sent' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('l’etat `sent` est ECRIT, pas supprime — une clef absente redeviendrait envoyable', async () => {
    const statusKV = makeStore({ 'msg-6': 'pending' });
    await deliverScheduledEmail(
      { messageId: 'msg-6', connectionId: 'c', mail: BODY },
      {
        statusKV,
        payloadKV: makeStore(),
        reservation: openGate(),
        send: vi.fn(async () => {}),
        logger: silentLogger,
      },
    );
    expect(statusKV.delete).not.toHaveBeenCalled();
    expect(statusKV.map.get('msg-6')).toBe('sent');
  });

  it('libere le corps une fois parti', async () => {
    const payloadKV = makeStore({ 'msg-10': JSON.stringify(BODY) });
    await deliverScheduledEmail(
      { messageId: 'msg-10', connectionId: 'c' },
      {
        statusKV: makeStore(),
        payloadKV,
        reservation: openGate(),
        send: vi.fn(async () => {}),
        logger: silentLogger,
      },
    );
    expect(payloadKV.map.has('msg-10')).toBe(false);
  });

  it('isNonSendableStatus ne bloque pas `pending` ni un etat inconnu', () => {
    expect(isNonSendableStatus('pending')).toBe(false);
    expect(isNonSendableStatus(null)).toBe(false);
    expect(isNonSendableStatus('failed')).toBe(false);
    expect(isNonSendableStatus('sent')).toBe(true);
    expect(isNonSendableStatus('sending')).toBe(true);
    expect(isNonSendableStatus('cancelled')).toBe(true);
    expect(isNonSendableStatus('unresolved')).toBe(true);
  });
});

describe('deliverScheduledEmail — routage draft / creation', () => {
  it('relaie le corps rehydrate au driver', async () => {
    const send = vi.fn(async () => {});
    const stored: StoredOutgoingMessage = {
      ...BODY,
      attachments: [{ name: 'a.txt', type: 'text/plain', base64: 'aGk=' }],
    };
    await deliverScheduledEmail(
      { messageId: 'msg-11', connectionId: 'conn-9' },
      {
        statusKV: makeStore(),
        payloadKV: makeStore({ 'msg-11': JSON.stringify(stored) }),
        reservation: openGate(),
        send,
        logger: silentLogger,
      },
    );
    const [connectionId, payload] = send.mock.calls[0] as unknown as [
      string,
      StoredOutgoingMessage,
    ];
    expect(connectionId).toBe('conn-9');
    const attachments = payload.attachments ?? [];
    expect(attachments).toHaveLength(1);
    expect('arrayBuffer' in (attachments[0] as object)).toBe(true);
  });
});

describe('normalizeStoredAttachments', () => {
  it('preserve l’ordre et laisse intactes les pieces deja rehydratees', () => {
    const already = { name: 'b', type: 't', arrayBuffer: async () => new ArrayBuffer(0) };
    const out = normalizeStoredAttachments({
      ...BODY,
      attachments: [{ name: 'a', type: 'text/plain', base64: 'aGk=' }, already],
    });
    expect(out.attachments).toHaveLength(2);
    expect(out.attachments?.[0]).toHaveProperty('name', 'a');
    expect(out.attachments?.[1]).toBe(already);
  });

  it('sans piece jointe, rend l’entree telle quelle', () => {
    expect(normalizeStoredAttachments(BODY)).toBe(BODY);
  });
});
