import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * Preuve, sur la ROUTE réelle, que `/ai/do/:action` et `/ai/call` relâchent leur connexion
 * Postgres sur les chemins qui la fuyaient.
 *
 * Constat corrigé : `const { db, conn } = createDb(...)` puis `if (!user) return
 * c.json(..., 401)` AVANT le `await conn.end()`. Un appelant vocal dont le numéro n'est pas
 * vérifié — le cas d'un appel non autorisé, donc répétable à volonté par un tiers —
 * abandonnait une connexion à chaque requête.
 *
 * Ici, `src/db/index.ts` n'est PAS doublé : `withDb` et `createDb` sont le code de
 * production. Seuls le pilote `postgres` et `drizzle` le sont, à la frontière réseau, de
 * sorte que le `conn.end()` observé est celui que la route déclenche réellement.
 */

const end = vi.fn(async () => undefined);
const conn = { end };

const userFindFirst = vi.fn(
  async (): Promise<unknown> => ({
    id: 'u1',
    defaultConnectionId: 'c1',
  }),
);
const connectionFindFirst = vi.fn(async (): Promise<unknown> => ({ id: 'c1', userId: 'u1' }));
const db = {
  query: { user: { findFirst: userFindFirst }, connection: { findFirst: connectionFindFirst } },
};

vi.mock('postgres', () => ({ default: vi.fn(() => conn) }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: vi.fn(() => db) }));
vi.mock('../lib/voice-auth', () => ({ isAuthorizedVoiceCaller: () => true }));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../services/call-service/system-prompt', () => ({ systemPrompt: '' }));
vi.mock('../env', () => ({
  env: {
    DISABLE_CALLS: false,
    VOICE_SECRET: 's',
    HYPERDRIVE: { connectionString: 'postgres://x' },
  },
}));
vi.mock('./agent/tools', () => ({
  tools: async () => ({
    askZeroMailbox: {
      parameters: z.object({ query: z.string() }),
      execute: async (input: unknown) => ({ echoed: input }),
    },
  }),
}));

const { aiRouter } = await import('./ai');

const post = (path: string, body: unknown) =>
  aiRouter.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Voice-Secret': 's', 'X-Caller': '+689' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  end.mockClear();
  userFindFirst.mockClear();
  connectionFindFirst.mockClear();
  userFindFirst.mockImplementation(async () => ({ id: 'u1', defaultConnectionId: 'c1' }));
  connectionFindFirst.mockImplementation(async () => ({ id: 'c1', userId: 'u1' }));
});

describe('/ai — la connexion Postgres est relâchée sur tous les chemins', () => {
  it('relâche la connexion sur le chemin nominal', async () => {
    const response = await post('/do/askZeroMailbox', { query: 'factures' });

    expect(response.status).toBe(200);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('relâche la connexion sur le RETOUR ANTICIPÉ « utilisateur non vérifié » (/do)', async () => {
    // Forme de production exacte : `findFirst` ne rend rien quand le numéro appelant n'est
    // rattaché à aucun utilisateur vérifié. C'est le `return 401` qui sautait le `end()`.
    userFindFirst.mockImplementation(async () => undefined);

    const response = await post('/do/askZeroMailbox', { query: 'factures' });

    expect(response.status).toBe(401);
    expect(connectionFindFirst).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('relâche la connexion quand aucune connexion n’est rattachée à l’utilisateur (/do)', async () => {
    connectionFindFirst.mockImplementation(async () => undefined);

    const response = await post('/do/askZeroMailbox', { query: 'factures' });

    expect(response.status).toBe(401);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('relâche la connexion quand la REQUÊTE elle-même échoue (/do)', async () => {
    // Panne réseau Hyperdrive : `findFirst` rejette. Aucun `conn.end()` n'était atteint.
    userFindFirst.mockImplementation(async () => {
      throw new Error('connection terminated unexpectedly');
    });

    await Promise.resolve(post('/do/askZeroMailbox', { query: 'factures' })).catch(() => undefined);

    expect(end).toHaveBeenCalledTimes(1);
  });

  it('relâche la connexion sur le RETOUR ANTICIPÉ « utilisateur non vérifié » (/call)', async () => {
    userFindFirst.mockImplementation(async () => undefined);

    const response = await post('/call', { query: 'mes factures' });

    expect(response.status).toBe(401);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
