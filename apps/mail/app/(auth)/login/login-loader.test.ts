import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// pitbull (point 7) — `clientLoader` faisait un `fetch` nu : pas de try/catch, pas de test
// de `response.ok`, `response.json()` appelé sur n'importe quelle réponse. Backend
// injoignable, 5xx ou réponse non-JSON = exception dans le loader, donc ErrorBoundary
// RACINE à la place du formulaire : l'utilisateur ne peut plus se connecter du tout.
//
// Les réponses simulées ci-dessous sont de vraies `Response` (statuts et corps réellement
// renvoyés en production : 503 d'un proxy, page HTML d'erreur en 200, rejet réseau).

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// login-client tire better-auth, nuqs et les icônes ; le loader n'en dépend pas.
vi.mock('./login-client', () => ({ LoginClient: () => null }));

import { clientLoader } from './page';
import { log } from '@/lib/log';

const originalFetch = globalThis.fetch;

const provider = {
  id: 'google',
  name: 'Google',
  enabled: true,
  envVarStatus: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function respondWith(response: Response) {
  globalThis.fetch = vi.fn().mockResolvedValue(response) as typeof globalThis.fetch;
}

describe('clientLoader — chemin nominal', () => {
  it('rend les providers du backend et ne signale aucune dégradation', async () => {
    respondWith(
      new Response(JSON.stringify({ allProviders: [provider] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const data = await clientLoader();

    expect(data.allProviders).toHaveLength(1);
    expect(data.providersUnavailable).toBe(false);
  });
});

describe('clientLoader — le formulaire doit rester atteignable', () => {
  it('ne lève pas et dégrade quand le backend répond 503', async () => {
    respondWith(new Response('Service Unavailable', { status: 503 }));

    const data = await clientLoader();

    expect(data.allProviders).toEqual([]);
    expect(data.providersUnavailable).toBe(true);
    expect(log.error).toHaveBeenCalled();
  });

  it('ne lève pas et dégrade quand la réponse est 200 mais pas du JSON (page de proxy)', async () => {
    respondWith(
      new Response('<html><body>Gateway</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const data = await clientLoader();

    expect(data.allProviders).toEqual([]);
    expect(data.providersUnavailable).toBe(true);
  });

  it('ne lève pas et dégrade quand le réseau rejette (backend injoignable)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as typeof globalThis.fetch;

    await expect(clientLoader()).resolves.toMatchObject({
      allProviders: [],
      providersUnavailable: true,
    });
  });

  it('ne lève pas quand le JSON est valide mais sans `allProviders`', async () => {
    respondWith(
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const data = await clientLoader();

    expect(data.allProviders).toEqual([]);
    expect(data.providersUnavailable).toBe(true);
  });

  it("ne lève pas quand `allProviders` n'est pas un tableau", async () => {
    respondWith(
      new Response(JSON.stringify({ allProviders: 'google' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(clientLoader()).resolves.toMatchObject({ allProviders: [] });
  });
});
