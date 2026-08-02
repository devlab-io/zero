import { computeHmacSha256Hex } from '../lib/integrations/linear-webhook';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route Hono du webhook Linear (P18 durci) — store et DB MOCKÉS : signature
 * brute avant parsing, secret absent = 503, en-tête Linear-Timestamp cohérent
 * exigé, Linear-Delivery UUID STRICT, claim+process+processed dans UNE
 * transaction (échec = rollback + 500 → Linear retente), replay 200
 * UNIQUEMENT si la ligne est processed (sinon 409).
 */

const store = vi.hoisted(() => ({
  claimWebhookDelivery: vi.fn(async () => true),
  markWebhookDeliveryProcessed: vi.fn(async () => {}),
  processLinearEvent: vi.fn(async () => 'synced'),
  isWebhookDeliveryProcessed: vi.fn(async () => true),
}));
vi.mock('../lib/teams/team-integrations-store', () => store);

const fakeEnv = vi.hoisted(() => ({
  LINEAR_WEBHOOK_SECRET: 'whsec_route_test' as string | undefined,
  HYPERDRIVE: { connectionString: 'postgres://fake' },
}));
vi.mock('../env', () => ({ env: fakeEnv }));
const txState = vi.hoisted(() => ({ rolledBack: false }));
vi.mock('../db', () => ({
  createDb: () => ({
    db: {
      // Transaction fidèle : un throw du callback ROLLBACK (marqueur) puis
      // remonte — le route handler doit répondre 500.
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        try {
          return await fn({});
        } catch (error) {
          txState.rolledBack = true;
          throw error;
        }
      },
    },
    conn: { end: async () => {} },
  }),
}));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { integrationsLinearRouter } from './integrations-linear';

const SECRET = 'whsec_route_test';
const DELIVERY = '018f3c2a-1b2c-4d5e-8f90-abcdef012345';
const executionCtx = { waitUntil: () => {} } as unknown as ExecutionContext;

async function post(body: string, headers: Record<string, string>) {
  return await integrationsLinearRouter.request(
    '/linear/webhook',
    { method: 'POST', body, headers },
    {},
    executionCtx,
  );
}

async function signedHeaders(body: string, over: Record<string, string> = {}) {
  const parsed = JSON.parse(body) as { webhookTimestamp?: number };
  return {
    'Linear-Signature': await computeHmacSha256Hex(SECRET, new TextEncoder().encode(body)),
    'Linear-Delivery': DELIVERY,
    'Linear-Timestamp': String(parsed.webhookTimestamp ?? Date.now()),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  txState.rolledBack = false;
  fakeEnv.LINEAR_WEBHOOK_SECRET = SECRET;
  store.claimWebhookDelivery.mockResolvedValue(true);
  store.processLinearEvent.mockResolvedValue('synced');
  store.isWebhookDeliveryProcessed.mockResolvedValue(true);
});

describe('POST /integrations/linear/webhook (durci)', () => {
  const validBody = () =>
    JSON.stringify({ type: 'Issue', action: 'update', webhookTimestamp: Date.now() });

  it('livraison signée valide → claim + traitement + processed (même transaction), 200', async () => {
    const body = validBody();
    const response = await post(body, await signedHeaders(body));
    expect(response.status).toBe(200);
    expect(store.claimWebhookDelivery).toHaveBeenCalledWith(expect.anything(), DELIVERY, 'Issue');
    expect(store.processLinearEvent).toHaveBeenCalledTimes(1);
    expect(store.markWebhookDeliveryProcessed).toHaveBeenCalledWith(
      expect.anything(),
      DELIVERY,
      'synced',
    );
  });

  it('secret non configuré → 503 FAIL CLOSED ; signature invalide → 401 avant tout store', async () => {
    fakeEnv.LINEAR_WEBHOOK_SECRET = undefined;
    const body = validBody();
    expect((await post(body, await signedHeaders(body))).status).toBe(503);
    fakeEnv.LINEAR_WEBHOOK_SECRET = SECRET;
    const bad = await post(body, {
      'Linear-Signature': 'deadbeef',
      'Linear-Delivery': DELIVERY,
      'Linear-Timestamp': String(Date.now()),
    });
    expect(bad.status).toBe(401);
    expect(store.claimWebhookDelivery).not.toHaveBeenCalled();
  });

  it('Linear-Timestamp ABSENT ou incohérent avec webhookTimestamp → 400 ; corps périmé → 400', async () => {
    const body = validBody();
    const noHeader = await post(body, await signedHeaders(body, { 'Linear-Timestamp': '' }));
    expect(noHeader.status).toBe(400);
    const drifted = await post(
      body,
      await signedHeaders(body, { 'Linear-Timestamp': String(Date.now() - 120_000) }),
    );
    expect(drifted.status).toBe(400);
    const staleBody = JSON.stringify({ type: 'Issue', webhookTimestamp: Date.now() - 5 * 60_000 });
    const stale = await post(staleBody, await signedHeaders(staleBody));
    expect(stale.status).toBe(400);
    expect(store.claimWebhookDelivery).not.toHaveBeenCalled();
  });

  it('Linear-Delivery non-UUID → 400, jamais de claim', async () => {
    const body = validBody();
    for (const delivery of ['', 'del-1', 'not-a-uuid', `${DELIVERY}x`]) {
      const response = await post(body, await signedHeaders(body, { 'Linear-Delivery': delivery }));
      expect(response.status).toBe(400);
    }
    expect(store.claimWebhookDelivery).not.toHaveBeenCalled();
  });

  it('replay : 200 UNIQUEMENT si la ligne est processed ; en cours (claim sans processed) → 409', async () => {
    const body = validBody();
    store.claimWebhookDelivery.mockResolvedValueOnce(false);
    store.isWebhookDeliveryProcessed.mockResolvedValueOnce(true);
    const replay = await post(body, await signedHeaders(body));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replay: true });
    expect(store.processLinearEvent).not.toHaveBeenCalled();

    store.claimWebhookDelivery.mockResolvedValueOnce(false);
    store.isWebhookDeliveryProcessed.mockResolvedValueOnce(false);
    const inFlight = await post(body, await signedHeaders(body));
    expect(inFlight.status).toBe(409);
  });

  it('traitement en échec → transaction ROLLBACK + 500 (Linear retente), l’erreur ne fuit pas', async () => {
    store.processLinearEvent.mockRejectedValueOnce(new Error('db down with secrets'));
    const body = validBody();
    const response = await post(body, await signedHeaders(body));
    expect(response.status).toBe(500);
    expect(txState.rolledBack).toBe(true);
    expect(store.markWebhookDeliveryProcessed).not.toHaveBeenCalled();
    const json = (await response.json()) as { error: string };
    expect(JSON.stringify(json)).not.toContain('secrets');
  });
});
