import {
  cancelTtlSeconds,
  deliverScheduledEmail,
  isNonSendableStatus,
  MAX_KV_TTL_SECONDS,
  MAX_QUEUE_DELAY_SECONDS,
  MIN_KV_TTL_SECONDS,
  normalizeStoredAttachments,
  scheduleTtlSeconds,
  SEND_TTL_GRACE_SECONDS,
  TERMINAL_MARKER_TTL_SECONDS,
  type ScheduledSendStore,
  type StoredOutgoingMessage,
} from './scheduled-send';
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

// ---------------------------------------------------------------------------
// P1 — payload absent : echec explicite, plus d'acquittement muet.
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail — payload absent (P1)', () => {
  it('ecrit `failed` et rejoue au lieu d’acquitter en silence', async () => {
    const statusKV = makeStore({ 'msg-1': 'pending' });
    const payloadKV = makeStore();
    const send = vi.fn(async () => {});
    const retry = vi.fn();

    const out = await deliverScheduledEmail(
      { messageId: 'msg-1', connectionId: 'conn-1' },
      { statusKV, payloadKV, send, retry, logger: silentLogger },
    );

    expect(out).toEqual({ outcome: 'missing-payload' });
    expect(send).not.toHaveBeenCalled();
    expect(statusKV.map.get('msg-1')).toBe('failed');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('la marque `failed` porte un TTL (pas de clef immortelle)', async () => {
    const statusKV = makeStore({ 'msg-1': 'pending' });
    await deliverScheduledEmail(
      { messageId: 'msg-1', connectionId: 'conn-1' },
      {
        statusKV,
        payloadKV: makeStore(),
        send: vi.fn(async () => {}),
        logger: silentLogger,
      },
    );
    expect(statusKV.puts.at(-1)?.ttl).toBe(TERMINAL_MARKER_TTL_SECONDS);
  });
});

// ---------------------------------------------------------------------------
// P2 — double envoi.
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail — idempotence (P2)', () => {
  it('reserve `sending` AVANT l’appel au driver', async () => {
    const statusKV = makeStore({ 'msg-2': 'pending' });
    const seen: string[] = [];
    const send = vi.fn(async () => {
      seen.push(statusKV.map.get('msg-2') as string);
    });

    await deliverScheduledEmail(
      { messageId: 'msg-2', connectionId: 'c', mail: BODY },
      { statusKV, payloadKV: makeStore(), send, logger: silentLogger },
    );

    expect(seen).toEqual(['sending']);
  });

  it('une redelivrance apres un envoi reussi n’envoie pas une seconde fois', async () => {
    const statusKV = makeStore({ 'msg-3': 'pending' });
    const payloadKV = makeStore({ 'msg-3': JSON.stringify(BODY) });
    const send = vi.fn(async () => {});
    const deps = { statusKV, payloadKV, send, logger: silentLogger };

    const first = await deliverScheduledEmail({ messageId: 'msg-3', connectionId: 'c' }, deps);
    expect(first).toEqual({ outcome: 'sent' });
    expect(statusKV.map.get('msg-3')).toBe('sent');

    // La queue redelivre le meme message (livraison au-moins-une-fois).
    const second = await deliverScheduledEmail({ messageId: 'msg-3', connectionId: 'c' }, deps);
    expect(second).toEqual({ outcome: 'skipped', status: 'sent' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('un isolate mort entre l’envoi et l’ecriture `sent` ne provoque pas de doublon', async () => {
    const statusKV = makeStore({ 'msg-4': 'pending' });
    const payloadKV = makeStore({ 'msg-4': JSON.stringify(BODY) });
    const send = vi.fn(async () => {});
    const retry = vi.fn();

    // Simulation : l'envoi reussit, puis la suite du handler ne s'execute jamais.
    // On rejoue simplement le handler avec l'etat KV laisse par la reservation.
    await deliverScheduledEmail(
      { messageId: 'msg-4', connectionId: 'c' },
      {
        statusKV,
        payloadKV,
        send: async () => {
          await send();
          throw new Error('isolate killed');
        },
        retry,
        logger: silentLogger,
      },
    );
    // Sur un echec franc on repasse en `failed` : le message est rejouable.
    expect(statusKV.map.get('msg-4')).toBe('failed');

    // Mais si l'ecriture de `failed` n'avait pas eu lieu (isolate tue), l'etat reste
    // `sending` et la redelivrance est bloquee.
    const stuck = makeStore({ 'msg-5': 'sending' });
    const resend = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-5', connectionId: 'c', mail: BODY },
      { statusKV: stuck, payloadKV: makeStore(), send: resend, logger: silentLogger },
    );
    expect(out).toEqual({ outcome: 'skipped', status: 'sending' });
    expect(resend).not.toHaveBeenCalled();
  });

  it('l’etat `sent` est ECRIT, pas supprime — une clef absente redeviendrait envoyable', async () => {
    const statusKV = makeStore({ 'msg-6': 'pending' });
    await deliverScheduledEmail(
      { messageId: 'msg-6', connectionId: 'c', mail: BODY },
      { statusKV, payloadKV: makeStore(), send: vi.fn(async () => {}), logger: silentLogger },
    );
    expect(statusKV.delete).not.toHaveBeenCalled();
    expect(statusKV.map.get('msg-6')).toBe('sent');
  });

  it('conserve le rejet de `cancelled` deja en place', async () => {
    const send = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-7', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore({ 'msg-7': 'cancelled' }),
        payloadKV: makeStore(),
        send,
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'skipped', status: 'cancelled' });
    expect(send).not.toHaveBeenCalled();
  });

  it('un echec franc garde le corps et rejoue', async () => {
    const statusKV = makeStore({ 'msg-8': 'pending' });
    const payloadKV = makeStore({ 'msg-8': JSON.stringify(BODY) });
    const retry = vi.fn();

    const out = await deliverScheduledEmail(
      { messageId: 'msg-8', connectionId: 'c' },
      {
        statusKV,
        payloadKV,
        send: vi.fn(async () => {
          throw new Error('gmail 500');
        }),
        retry,
        logger: silentLogger,
      },
    );

    expect(out).toMatchObject({ outcome: 'failed' });
    expect(payloadKV.map.has('msg-8')).toBe(true);
    expect(statusKV.map.get('msg-8')).toBe('failed');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('apres un echec, le message redevient envoyable', async () => {
    const send = vi.fn(async () => {});
    const out = await deliverScheduledEmail(
      { messageId: 'msg-9', connectionId: 'c', mail: BODY },
      {
        statusKV: makeStore({ 'msg-9': 'failed' }),
        payloadKV: makeStore(),
        send,
        logger: silentLogger,
      },
    );
    expect(out).toEqual({ outcome: 'sent' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('libere le corps une fois parti', async () => {
    const payloadKV = makeStore({ 'msg-10': JSON.stringify(BODY) });
    await deliverScheduledEmail(
      { messageId: 'msg-10', connectionId: 'c' },
      {
        statusKV: makeStore(),
        payloadKV,
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
