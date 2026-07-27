import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Preuve que le cache `threadsListCache` de lib/server-utils.ts possède désormais un point
 * d'invalidation, et qu'une mutation de fil le déclenche.
 *
 * Constat corrigé : le cache avait 5 s de TTL et AUCUNE invalidation. Archiver, supprimer
 * ou réétiqueter un fil laissait la liste d'avant la mutation servie jusqu'à 5 s — l'action
 * de l'utilisateur se défaisait sous ses yeux avant de se refaire.
 *
 * Les doubles se limitent à la frontière réseau (le client Durable Object `dormroom` et
 * l'environnement Workers) : le cache, ses clés, sa table de versions et le câblage de
 * l'invalidation dans `modifyThreadLabelsInDB` sont le code de production.
 */

const getThreadsFromDBStub = vi.fn(async () => ({ threads: [{ id: 't1' }], nextPageToken: null }));
const modifyThreadLabelsInDBStub = vi.fn(async () => undefined);
const getThreadStub = vi.fn(async () => ({ id: 't1', messages: [{ id: 'm1' }] }));

const shardStub = {
  setName: vi.fn(async () => undefined),
  getDatabaseSize: vi.fn(async () => 1),
  getThreadsFromDB: getThreadsFromDBStub,
  modifyThreadLabelsInDB: modifyThreadLabelsInDBStub,
  getThread: getThreadStub,
  count: vi.fn(async () => []),
  deleteAllSpam: vi.fn(async () => ({ deletedCount: 0 })),
  forceReSync: vi.fn(async () => undefined),
  syncThread: vi.fn(async () => ({ success: true })),
};

const socketAgent = {
  invalidateDoStateCache: vi.fn(async () => undefined),
  getCachedDoState: vi.fn(async () => ({ storageSize: 0, counts: [], shards: 1 })),
  setCachedDoState: vi.fn(async () => undefined),
  broadcastChatMessage: vi.fn(async () => undefined),
};

vi.mock('dormroom', () => ({
  createClient: () => ({
    exec: async () => ({ array: [{ shard_id: 's1' }] }),
    stub: shardStub,
  }),
}));
vi.mock('../env', () => ({
  env: {
    SHARD_REGISTRY: {},
    ZERO_DRIVER: {},
    ZERO_AGENT: { get: () => socketAgent, idFromName: (name: string) => name },
    HYPERDRIVE: { connectionString: 'postgres://x' },
  },
}));
vi.mock('./driver', () => ({ createDriver: vi.fn() }));
vi.mock('./connection-context', () => ({ getActiveConnection: vi.fn(), getZeroDB: vi.fn() }));
vi.mock('./pubsub-auth', () => ({
  resolvePubSubTokenPolicy: vi.fn(),
  verifyPubSubToken: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../db', () => ({ withDb: vi.fn() }));
vi.mock('./logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { getThreadsFromDB, invalidateThreadsListCache, modifyThreadLabelsInDB } = await import(
  './server-utils'
);

const listInbox = (connectionId: string) => getThreadsFromDB(connectionId, { folder: 'inbox' });

beforeEach(() => {
  getThreadsFromDBStub.mockClear();
  modifyThreadLabelsInDBStub.mockClear();
});

describe('threadsListCache — invalidation sur mutation de fil', () => {
  it('sert la seconde lecture depuis le cache tant qu’aucune mutation n’a lieu', async () => {
    const connectionId = 'conn-cache-hit';

    await listInbox(connectionId);
    await listInbox(connectionId);

    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(1);
  });

  it('repart de la projection après invalidation, sans attendre les 5 s de TTL', async () => {
    const connectionId = 'conn-invalidate';

    await listInbox(connectionId);
    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(1);

    invalidateThreadsListCache(connectionId);

    await listInbox(connectionId);
    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(2);
  });

  it('n’invalide que la connexion visée', async () => {
    const mutated = 'conn-scope-a';
    const untouched = 'conn-scope-b';

    await listInbox(mutated);
    await listInbox(untouched);
    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(2);

    invalidateThreadsListCache(mutated);

    await listInbox(untouched);
    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(2); // toujours servi du cache

    await listInbox(mutated);
    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(3);
  });

  it('une mutation de libellés RÉELLE périme la liste', async () => {
    const connectionId = 'conn-mutation';

    await listInbox(connectionId);
    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(1);

    // Chemin de production complet : `modifyThreadLabelsInDB` résout le shard, applique la
    // modification, puis — c'est le câblage ajouté — périme la liste en cache.
    await modifyThreadLabelsInDB(connectionId, 't1', ['STARRED'], ['UNREAD']);
    expect(modifyThreadLabelsInDBStub).toHaveBeenCalledTimes(1);

    await listInbox(connectionId);
    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(2);
  });

  it('des invalidations successives restent correctes (la version ne retombe pas)', async () => {
    const connectionId = 'conn-repeat';

    await listInbox(connectionId);
    invalidateThreadsListCache(connectionId);
    await listInbox(connectionId);
    invalidateThreadsListCache(connectionId);
    await listInbox(connectionId);

    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(3);
  });

  it('la table des versions se purge une fois qu’aucune entrée de la génération précédente ne peut survivre', async () => {
    const connectionId = 'conn-prune';
    const t0 = Date.now();

    // Invalidation datée dans le passé au-delà du TTL des entrées : la version doit être
    // considérée comme expirée, sans jamais ressusciter une entrée périmée (toute entrée
    // portant la version 0 aurait, elle aussi, dépassé son TTL).
    invalidateThreadsListCache(connectionId, t0 - 60_000);

    await listInbox(connectionId);
    await listInbox(connectionId);

    expect(getThreadsFromDBStub).toHaveBeenCalledTimes(1);
  });
});
