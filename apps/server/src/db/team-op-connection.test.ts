import { runTeamOpWithFreshDb } from './durable-objects';
import { POSTGRES_CONNECTION_OPTIONS } from './index';
import { describe, expect, it, vi } from 'vitest';
import type { createDb } from './index';

type DbResource = ReturnType<typeof createDb>;

const makeFactory = () => {
  const resources: Array<{ db: { id: number }; end: ReturnType<typeof vi.fn> }> = [];
  const factory = vi.fn(() => {
    const resource = {
      db: { id: resources.length + 1 },
      end: vi.fn(async () => {}),
    };
    resources.push(resource);
    return { db: resource.db, conn: { end: resource.end } } as unknown as DbResource;
  });
  return { factory, resources };
};

describe('runTeamOpWithFreshDb — isolation des invocations Workers', () => {
  it('verrouille les options Postgres.js recommandées pour Hyperdrive', () => {
    expect(POSTGRES_CONNECTION_OPTIONS).toEqual({
      max: 5,
      fetch_types: false,
      prepare: true,
    });
  });

  it('crée puis ferme un client Hyperdrive distinct pour chaque opération', async () => {
    const { factory, resources } = makeFactory();

    await expect(
      runTeamOpWithFreshDb(
        'postgres://hyperdrive',
        async (db) => (db as never as { id: number }).id,
        factory,
      ),
    ).resolves.toBe(1);
    await expect(
      runTeamOpWithFreshDb(
        'postgres://hyperdrive',
        async (db) => (db as never as { id: number }).id,
        factory,
      ),
    ).resolves.toBe(2);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(resources[0]?.end).toHaveBeenCalledWith({ timeout: 2 });
    expect(resources[1]?.end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it('ferme aussi le client si une requête échoue, sans masquer son erreur', async () => {
    const { factory, resources } = makeFactory();
    const queryError = new Error('query failed');

    await expect(
      runTeamOpWithFreshDb(
        'postgres://hyperdrive',
        async () => {
          throw queryError;
        },
        factory,
      ),
    ).rejects.toBe(queryError);

    expect(resources[0]?.end).toHaveBeenCalledWith({ timeout: 2 });
  });
});
