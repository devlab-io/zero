import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

/**
 * P13 — `/a8n/notify/:providerId` parsait le corps JSON AVANT de vérifier le jeton.
 *
 * Conséquence mesurée sur le code d'origine : un appelant SANS jeton valide faisait tourner
 * `c.req.json()` sur une charge qu'il choisissait, et un corps illisible remontait en
 * exception jusqu'au `catch` du handler, qui la RELANÇAIT — 500 opaque.
 *
 * Ces tests exercent le VRAI handler Hono via `app.request(...)`. Seules les feuilles
 * (auth, tracing, env, sous-routeurs, MCP) sont neutralisées : l'ordre des opérations
 * du handler, lui, est réel.
 */

const verifyToken = vi.fn<(token?: string) => Promise<boolean>>(async () => true);
const send = vi.fn<(msg: unknown) => Promise<void>>(async () => undefined);

// `json()` de Hono est réel : on observe s'il a été SOLLICITÉ en espionnant le flux du corps.
const setAttributes = vi.fn();
const span = {
  setAttributes,
  recordException: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
};

vi.mock('../lib/server-utils', () => ({
  verifyToken: (token?: string) => verifyToken(token),
  getZeroDB: vi.fn(),
}));
vi.mock('../lib/tracing', () => ({
  initTracing: () => ({ startSpan: () => span }),
  getTraceContext: vi.fn(),
}));
vi.mock('../env', () => ({
  env: {
    DISABLE_WORKFLOWS: 'false',
    COOKIE_DOMAIN: 'example.test',
    NODE_ENV: 'test',
    IP_HASH_SALT: 'salt',
    thread_queue: { send: (msg: unknown) => send(msg) },
  },
}));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  describeRequest: vi.fn(() => ({})),
}));
vi.mock('../lib/auth', () => ({ createAuth: vi.fn(async () => ({ api: {} })) }));
vi.mock('../lib/agent-authorization', () => ({ authorizeAgentAccess: vi.fn() }));
vi.mock('../lib/internal-service-auth', () => ({
  INTERNAL_SERVICE_HEADER: 'x-internal-service',
  isInternalServiceCaller: vi.fn(async () => false),
  THINKING_MCP_PURPOSE: 'thinking',
}));
vi.mock('../lib/sequential-thinking', () => ({ ThinkingMCP: { serveSSE: vi.fn() } }));
vi.mock('./agent/mcp', () => ({ ZeroMCP: { serveSSE: vi.fn() } }));
vi.mock('hono-agents', () => ({
  agentsMiddleware: () => async (_c: unknown, next: () => unknown) => next(),
}));
vi.mock('@hono/trpc-server', () => ({
  trpcServer: () => async (_c: unknown, next: () => unknown) => next(),
}));
vi.mock('../trpc', () => ({ appRouter: {} }));
vi.mock('../db', () => ({ createDb: vi.fn() }));
vi.mock('better-auth/plugins', () => ({
  oAuthDiscoveryMetadata: () => async () => new Response('{}'),
}));
vi.mock('jose', () => ({ createLocalJWKSet: vi.fn(), jwtVerify: vi.fn() }));
vi.mock('./ai', () => ({ aiRouter: new Hono() }));
vi.mock('./autumn', () => ({ autumnApi: new Hono() }));
vi.mock('./auth', () => ({ publicRouter: new Hono() }));

const { app } = await import('./index');

const URL_NOTIFY = 'http://server.test/a8n/notify/google';

/**
 * Requête dont la LECTURE DU CORPS est observable.
 *
 * `c.req.json()` de Hono délègue à `c.req.raw.json()` (HonoRequest.#cachedBody). On compte
 * donc les appels sur l'instance `Request` réellement routée : `lu` à vrai signifie que le
 * parseur a travaillé sur le corps de l'appelant — c'est exactement ce que le point
 * reproche au code d'origine quand l'appelant n'est pas encore authentifié.
 */
const requeteObservable = (payload: string, headers: Record<string, string>) => {
  const requete = new Request(URL_NOTIFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: payload,
  });
  const etat = { lu: false };
  for (const methode of ['json', 'text', 'arrayBuffer', 'formData', 'blob'] as const) {
    const original = requete[methode].bind(requete);
    Object.defineProperty(requete, methode, {
      configurable: true,
      value: (...args: unknown[]) => {
        etat.lu = true;
        return (original as (...a: unknown[]) => unknown)(...args);
      },
    });
  }
  return { requete, etat };
};

const poster = (
  payload: string,
  headers: Record<string, string>,
): { reponse: Promise<Response>; etat: { lu: boolean } } => {
  const { requete, etat } = requeteObservable(payload, headers);
  return { reponse: Promise.resolve(app.request(requete)), etat };
};

const AUTH_OK = { Authorization: 'Bearer jeton-valide' };
const SUB = { 'x-goog-pubsub-subscription-name': 'projects/p/subscriptions/s' };

beforeEach(() => {
  verifyToken.mockReset();
  verifyToken.mockResolvedValue(true);
  send.mockReset();
  send.mockResolvedValue(undefined);
  setAttributes.mockClear();
});

describe('/a8n/notify/:providerId — le jeton est vérifié AVANT le corps (P13)', () => {
  it('sans en-tête Authorization : 401, et le corps n’est jamais lu', async () => {
    const { reponse, etat } = poster(JSON.stringify({ historyId: '42' }), {});
    const r = await reponse;

    expect(r.status).toBe(401);
    expect(etat.lu).toBe(false);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('jeton refusé : 403, et le corps n’est JAMAIS parsé', async () => {
    verifyToken.mockResolvedValue(false);
    const { reponse, etat } = poster(JSON.stringify({ historyId: '42' }), { ...AUTH_OK, ...SUB });
    const r = await reponse;

    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Forbidden' });
    // Le cœur du point : le parseur n'a pas travaillé pour un appelant non authentifié.
    expect(etat.lu).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('jeton refusé sur un corps illisible : 403 (le refus prime, aucun parsing)', async () => {
    verifyToken.mockResolvedValue(false);
    const { reponse, etat } = poster('{ ceci n est pas du JSON', { ...AUTH_OK, ...SUB });
    const r = await reponse;

    expect(r.status).toBe(403);
    expect(etat.lu).toBe(false);
  });

  it('le refus ne consulte plus l’historyId (il vient d’un appelant non authentifié)', async () => {
    verifyToken.mockResolvedValue(false);
    await poster(JSON.stringify({ historyId: 'secret-42' }), { ...AUTH_OK, ...SUB }).reponse;

    const attributs = setAttributes.mock.calls.flatMap((c) => Object.keys(c[0] ?? {}));
    expect(attributs).toContain('auth.status');
    expect(attributs).not.toContain('history.id');
  });
});

describe('/a8n/notify/:providerId — corps mal formé : 400 explicite (P13)', () => {
  it('jeton valide + JSON illisible : 400, jamais 500, jamais d’exception non gérée', async () => {
    const { reponse, etat } = poster('{ ceci n est pas du JSON', { ...AUTH_OK, ...SUB });
    const r = await reponse;

    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Invalid JSON body' });
    expect(etat.lu).toBe(true); // le jeton était valide : le parseur a bien été sollicité
    expect(send).not.toHaveBeenCalled();
  });

  it('corps vide avec jeton valide : 400 et non une 500', async () => {
    const { reponse } = poster('', { ...AUTH_OK, ...SUB });
    expect((await reponse).status).toBe(400);
  });
});

describe('/a8n/notify/:providerId — chemin nominal préservé', () => {
  it('jeton valide + corps valide + abonnement : 200 et mise en queue', async () => {
    const { reponse, etat } = poster(JSON.stringify({ historyId: '4242' }), {
      ...AUTH_OK,
      ...SUB,
    });
    const r = await reponse;

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ message: 'OK' });
    expect(etat.lu).toBe(true);
    expect(send).toHaveBeenCalledWith({
      providerId: 'google',
      historyId: '4242',
      subscriptionName: 'projects/p/subscriptions/s',
    });
  });

  it('jeton valide sans en-tête d’abonnement : 200 d’acquittement, rien en queue', async () => {
    const { reponse } = poster(JSON.stringify({ historyId: '7' }), AUTH_OK);
    const r = await reponse;

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });

  it('échec de mise en queue : 503 pour que Pub/Sub redélivre', async () => {
    send.mockRejectedValue(new Error('queue down'));
    const { reponse } = poster(JSON.stringify({ historyId: '9' }), { ...AUTH_OK, ...SUB });
    const r = await reponse;

    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ message: 'Failed to enqueue notification' });
  });
});
