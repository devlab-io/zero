import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Preuve que `withDb` relâche la connexion Postgres sur le chemin d'ERREUR aussi bien que
 * sur le chemin nominal.
 *
 * Constat corrigé : sur les 19 sites `createDb(` d'apps/server/src, la libération n'était
 * écrite que sur le chemin nominal — un `return` anticipé (routes/ai.ts), un `throw` de
 * validation (pipelines.ts), un rejeu `pRetry` (writing-style-service.ts) sautaient tous
 * par-dessus le `conn.end()`, et la connexion restait ouverte jusqu'à l'éviction de
 * l'isolate.
 *
 * Le module sous test est le VRAI `src/db/index.ts` : seuls le pilote `postgres` et
 * `drizzle` sont doublés, exactement à la frontière du réseau. Le `conn` observé ici est
 * donc l'objet que `createDb` construit réellement, et le `finally` exercé est celui du
 * code de production.
 */

const end = vi.fn(async () => undefined);
const conn = { end };
const db = { marker: 'drizzle' };

vi.mock('postgres', () => ({ default: vi.fn(() => conn) }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: vi.fn(() => db) }));
vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { withDb } = await import('./index');
const { logger } = await import('../lib/logger');

beforeEach(() => {
  end.mockClear();
  end.mockImplementation(async () => undefined);
  vi.mocked(logger.error).mockClear();
});

describe('withDb — la connexion est relâchée dans tous les cas', () => {
  it('relâche la connexion sur le chemin nominal et rend la valeur', async () => {
    const result = await withDb('postgres://x', async (handle) => {
      expect(handle).toBe(db);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('relâche la connexion quand le travail LÈVE, et propage l’erreur d’origine', async () => {
    const boom = new Error('Connection not found abc');

    await expect(
      withDb('postgres://x', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(end).toHaveBeenCalledTimes(1);
  });

  it('relâche la connexion sur un RETOUR ANTICIPÉ — la forme exacte du défaut de routes/ai.ts', async () => {
    // `/ai/do/:action` rendait un 401 entre les deux requêtes, sautant le `conn.end()`.
    const result = await withDb('postgres://x', async () => {
      const user = undefined;
      if (!user) return undefined;
      return 'jamais atteint';
    });

    expect(result).toBeUndefined();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('un échec de LIBÉRATION ne masque pas l’erreur d’origine et reste journalisé', async () => {
    const boom = new Error('transaction aborted');
    end.mockImplementation(async () => {
      throw new Error('socket already closed');
    });

    await expect(
      withDb('postgres://x', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(end).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('chaque emprunt ouvre puis referme sa propre connexion — un rejeu n’en fuit aucune', async () => {
    // Forme de writing-style-service.ts : `pRetry` rappelle le bloc après un échec.
    await expect(
      withDb('postgres://x', async () => {
        throw new Error('deadlock detected');
      }),
    ).rejects.toThrow('deadlock detected');
    await withDb('postgres://x', async () => 'ok');

    expect(end).toHaveBeenCalledTimes(2);
  });
});
