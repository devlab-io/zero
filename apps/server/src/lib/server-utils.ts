import type { IGetThreadResponse, IGetThreadsResponse } from './driver/types';
import { getActiveConnection, getZeroDB } from './connection-context';
// Réexport : `getActiveConnection` et `getZeroDB` vivent dans le module feuille
// lib/connection-context.ts pour casser le cycle server-utils ↔ driver (ADR-less, cf. pitbull A4).
export { getActiveConnection, getZeroDB };
import { resolvePubSubTokenPolicy, verifyPubSubToken } from './pubsub-auth';
import { OutgoingMessageType } from '../routes/agent/types';
import { defaultPageSize, FOLDERS } from './utils';
import { connection } from '../db/schema';
import { createClient } from 'dormroom';
import { createDriver } from './driver';
import { TtlCache } from './ttl-cache';
import { AppError } from './errors';
import { logger } from './logger';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { withDb } from '../db';
import { env } from '../env';

const mbToBytes = (mb: number) => mb * 1024 * 1024;

// 8GB
const MAX_SHARD_SIZE = mbToBytes(8192);

// Caches par isolate. Les stubs DO ne survivent pas d'une requête à l'autre,
// mais ces données simples oui — elles éliminent les sauts réseau séquentiels
// (registre, sondes, handshakes) qui dominaient la latence des requêtes chaudes.
// Le DO ZeroDriver se ré-initialise seul depuis son storage après éviction,
// donc sauter le handshake une fois qu'il a eu lieu est sûr.
const shardHandshakeDone = new Set<string>();
const activeShardCache = new Map<string, { shardId: string; expiresAt: number }>();
const shardListCache = new Map<string, { shards: { shard_id: string }[]; expiresAt: number }>();
// La topologie des shards ne change que lorsqu'un shard approche 8 GB ; 60 s de
// staleness inter-isolate sont sans conséquence (fenêtre bornée, lecture seule).
const SHARD_TOPOLOGY_TTL_MS = 60_000;

const invalidateShardTopology = (connectionId: string) => {
  activeShardCache.delete(connectionId);
  shardListCache.delete(connectionId);
};

// Isolate cache for hot listThreads calls: 5 s collapses the repeated reads of a
// single navigation; the sync pushes real updates over the websocket anyway.
const THREADS_LIST_TTL_MS = 5_000;
const threadsListCache = new TtlCache<IGetThreadsResponse>(THREADS_LIST_TTL_MS, 200);

// --- Invalidation de la liste de fils (A?, point 10) ---------------------------------
//
// Ce cache n'avait AUCUN point d'invalidation : archiver, supprimer ou réétiqueter un fil
// laissait la liste d'avant la mutation servie pendant les 5 s restantes — l'utilisateur
// voyait son action se défaire sous ses yeux, puis se refaire.
//
// L'invalidation passe par une VERSION par connexion, préfixée à la clé de cache, plutôt
// que par une suppression de clés : les clés portent le dossier, la pagination et les
// libellés, donc une mutation n'a aucun moyen d'énumérer celles qu'elle périme, et
// `TtlCache` n'expose pas de suppression par préfixe. Incrémenter la version rend
// inatteignables, d'un coup, toutes les entrées de la connexion ; elles s'effacent ensuite
// d'elles-mêmes par TTL.
//
// La table des versions se purge seule : une version cesse d'être utile dès qu'aucune
// entrée de la génération PRÉCÉDENTE ne peut plus être vivante, c'est-à-dire au bout de
// `THREADS_LIST_TTL_MS`. Retirer l'entrée alors — donc revenir à la version 0 — ne peut
// pas ressusciter une entrée périmée : toute entrée portant la version 0 aurait au moins
// cet âge, donc serait déjà expirée. La table reste ainsi bornée aux seules connexions
// mutées dans les 5 dernières secondes, sans dépendre d'une éviction LRU.
const threadsListVersions = new Map<string, { version: number; bumpedAt: number }>();

const pruneThreadsListVersions = (now: number) => {
  for (const [id, entry] of threadsListVersions) {
    if (entry.bumpedAt + THREADS_LIST_TTL_MS <= now) threadsListVersions.delete(id);
  }
};

const threadsListVersion = (connectionId: string, now: number = Date.now()): number => {
  const entry = threadsListVersions.get(connectionId);
  if (!entry) return 0;
  if (entry.bumpedAt + THREADS_LIST_TTL_MS <= now) {
    threadsListVersions.delete(connectionId);
    return 0;
  }
  return entry.version;
};

/**
 * Périme la liste de fils en cache pour cette connexion. À appeler depuis TOUT chemin qui
 * mute un fil (archivage, suppression, étiquetage, lu/non lu), afin que la lecture qui suit
 * la mutation reparte de la projection et non d'une liste d'avant.
 *
 * Portée : l'isolate courant. C'est exactement la portée du cache lui-même — `threadsListCache`
 * est une `Map` de module, non partagée entre isolates —, donc l'invalidation ne peut pas
 * être moins couvrante que ce qu'elle invalide.
 */
export const invalidateThreadsListCache = (connectionId: string, now: number = Date.now()) => {
  const current = threadsListVersions.get(connectionId);
  const stillFresh = current && current.bumpedAt + THREADS_LIST_TTL_MS > now;
  threadsListVersions.set(connectionId, {
    version: (stillFresh ? current.version : 0) + 1,
    bumpedAt: now,
  });
  pruneThreadsListVersions(now);
};
// sendDoState wakes the ZeroAgent DO; broadcasting state at most once a minute
// per connection is enough for a background refresh.
const doStateThrottle = new TtlCache<true>(60_000, 500);

class MockExecutionContext implements ExecutionContext {
  async waitUntil(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      logger.error('MockExecutionContext: Error in waitUntil', error);
    }
  }
  passThroughOnException(): void {}
  props: unknown;
}

const getRegistryClient = async (connectionId: string) => {
  const registryClient = createClient({
    doNamespace: env.SHARD_REGISTRY,
    configs: [{ name: `connection:${connectionId}:registry` }],
    ctx: new MockExecutionContext(),
  });
  return registryClient;
};

const getShardClient = async (connectionId: string, shardId: string) => {
  const shardClient = createClient({
    doNamespace: env.ZERO_DRIVER,
    ctx: new MockExecutionContext(),
    configs: [{ name: `connection:${connectionId}:shard:${shardId}` }],
  });
  const handshakeKey = `${connectionId}:${shardId}`;
  if (!shardHandshakeDone.has(handshakeKey)) {
    try {
      // setName exécute déjà setupAuth sous blockConcurrencyWhile : un seul RPC.
      await shardClient.stub.setName(connectionId);
      shardHandshakeDone.add(handshakeKey);
    } catch (error) {
      logger.error(`Failed to initialize shard ${shardId} for connection ${connectionId}:`, error);
      throw new Error(`Shard initialization failed: ${error}`);
    }
  }
  return shardClient;
};

type RegistryClient = Awaited<ReturnType<typeof getRegistryClient>>;
type ShardClient = Awaited<ReturnType<typeof getShardClient>>;

const listShards = async (registry: RegistryClient): Promise<{ shard_id: string }[]> => [
  ...(await registry.exec(`SELECT * FROM shards`)).array,
];

const listShardsCached = async (connectionId: string): Promise<{ shard_id: string }[]> => {
  const cached = shardListCache.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) return cached.shards;
  const registry = await getRegistryClient(connectionId);
  const shards = await listShards(registry);
  shardListCache.set(connectionId, { shards, expiresAt: Date.now() + SHARD_TOPOLOGY_TTL_MS });
  return shards;
};

const insertShard = (registry: RegistryClient, shardId: string) =>
  registry.exec(`INSERT INTO shards (shard_id) VALUES (?)`, [shardId]);

const deleteAllShards = async (registry: RegistryClient) => registry.exec(`DELETE FROM shards`);

// const aggregateShardData = async <T>(
//   connectionId: string,
//   shardOperation: (shard: ShardClient) => Promise<T>,
//   aggregator: (results: T[]) => T,
// ): Promise<T> => {
//   const registry = await getRegistryClient(connectionId);
//   const allShards = await listShards(registry);

//   const results = await Promise.all(
//     allShards.map(async ({ shard_id: id }) => {
//       const shard = await getShardClient(connectionId, id);
//       return await shardOperation(shard);
//     }),
//   );

//   return aggregator(results);
// };

export const aggregateShardDataEffect = <T, E = never>(
  connectionId: string,
  shardOperation: (shard: ShardClient) => Effect.Effect<T, E>,
  aggregator: (results: T[]) => T,
) => {
  return Effect.gen(function* () {
    const allShards = yield* Effect.tryPromise({
      try: () => listShardsCached(connectionId),
      catch: (error) => new Error(`Failed to list shards for connection ${connectionId}: ${error}`),
    });

    const shardEffects = allShards.map(({ shard_id }: { shard_id: string }) =>
      Effect.gen(function* () {
        const shard = yield* Effect.tryPromise({
          try: () => getShardClient(connectionId, shard_id),
          catch: (error) => new Error(`Failed to get shard client for shard ${shard_id}: ${error}`),
        });

        return yield* shardOperation(shard).pipe(
          Effect.catchAll((error) =>
            Effect.fail(new Error(`Operation failed on shard ${shard_id}: ${error}`)),
          ),
        );
      }),
    );

    const results = yield* Effect.all(shardEffects, { concurrency: 10 }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Failed to execute operations across shards: ${error}`)),
      ),
    );

    return aggregator(results);
  });
};

// const aggregateShardDataSequential = async <T, A>(
//   connectionId: string,
//   shardOperation: (
//     shard: ShardClient,
//     shardId: string,
//     accumulator: A,
//   ) => Promise<{ shouldContinue: boolean; accumulator: A }>,
//   initialAccumulator: A,
//   finalizer: (accumulator: A) => T,
// ): Promise<T> => {
//   const registry = await getRegistryClient(connectionId);
//   const allShards = await listShards(registry);

//   let accumulator = initialAccumulator;

//   for (const { shard_id: id } of allShards) {
//     const shard = await getShardClient(connectionId, id);
//     const { shouldContinue, accumulator: newAccumulator } = await shardOperation(
//       shard,
//       id,
//       accumulator,
//     );
//     accumulator = newAccumulator;

//     if (!shouldContinue) {
//       break;
//     }
//   }

//   return finalizer(accumulator);
// };

export const aggregateShardDataSequentialEffect = <T, A, E = never>(
  connectionId: string,
  shardOperation: (
    shard: ShardClient,
    shardId: string,
    accumulator: A,
  ) => Effect.Effect<{ shouldContinue: boolean; accumulator: A }, E>,
  initialAccumulator: A,
  finalizer: (accumulator: A) => T,
) => {
  return Effect.gen(function* () {
    const allShards = yield* Effect.tryPromise({
      try: () => listShardsCached(connectionId),
      catch: (error) => new Error(`Failed to list shards for connection ${connectionId}: ${error}`),
    });

    let accumulator = initialAccumulator;

    for (const { shard_id: id } of allShards) {
      const shard = yield* Effect.tryPromise({
        try: () => getShardClient(connectionId, id),
        catch: (error) => new Error(`Failed to get shard client for shard ${id}: ${error}`),
      });

      const { shouldContinue, accumulator: newAccumulator } = yield* shardOperation(
        shard,
        id,
        accumulator,
      ).pipe(
        Effect.catchAll((error) =>
          Effect.fail(new Error(`Operation failed on shard ${id}: ${error}`)),
        ),
      );

      accumulator = newAccumulator;

      if (!shouldContinue) {
        break;
      }
    }

    return finalizer(accumulator);
  });
};

export const raceShardDataEffect = <T, E = never>(
  connectionId: string,
  shardOperation: (shard: ShardClient, shardId: string) => Effect.Effect<T, E>,
  fallbackValue: T,
) => {
  return Effect.gen(function* () {
    const allShards = yield* Effect.tryPromise({
      try: () => listShardsCached(connectionId),
      catch: (error) => new Error(`Failed to list shards for connection ${connectionId}: ${error}`),
    });

    if (allShards.length === 0) {
      return { result: fallbackValue, shardId: null };
    }

    const shardEffects = allShards.map(({ shard_id }: { shard_id: string }) =>
      Effect.gen(function* () {
        const shard = yield* Effect.tryPromise({
          try: () => getShardClient(connectionId, shard_id),
          catch: (error) => new Error(`Failed to get shard client for shard ${shard_id}: ${error}`),
        });

        const result = yield* shardOperation(shard, shard_id).pipe(
          Effect.catchAll((error) =>
            Effect.fail(new Error(`Operation failed on shard ${shard_id}: ${error}`)),
          ),
        );

        return { result, shardId: shard_id };
      }),
    );

    return yield* Effect.raceAll(shardEffects).pipe(
      Effect.catchAll((error) => {
        logger.warn('shard raceAll failed; using fallback value', { error });
        return Effect.succeed({ result: fallbackValue, shardId: null });
      }),
    );
  });
};

const getThreadEffect = (connectionId: string, threadId: string) => {
  return raceShardDataEffect(
    connectionId,
    (shard, shardId) =>
      Effect.gen(function* () {
        const thread = yield* Effect.tryPromise({
          try: async () => shard.stub.getThread(threadId, true),
          catch: (error) =>
            new Error(`Failed to setup auth or get thread from shard ${shardId}: ${error}`),
        });

        if (thread) {
          return thread;
        }

        return yield* Effect.fail(new Error(`Thread ${threadId} not found in shard ${shardId}`));
      }),
    null,
  );
};

export const getThread: (
  connectionId: string,
  threadId: string,
) => Promise<{ result: IGetThreadResponse; shardId: string }> = async (
  connectionId: string,
  threadId: string,
) => {
  const result = await Effect.runPromise(getThreadEffect(connectionId, threadId));
  if (!result.result) {
    throw new Error(`Thread ${threadId} not found`);
  }
  if (!result.shardId) {
    throw new Error(`Thread ${threadId} not found in any shard`);
  }
  return { result: result.result, shardId: result.shardId };
};

export const modifyThreadLabelsInDB = async (
  connectionId: string,
  threadId: string,
  addLabels: string[],
  removeLabels: string[],
) => {
  const threadResult = await getThread(connectionId, threadId);
  const shard = await getShardClient(connectionId, threadResult.shardId);
  await shard.stub.modifyThreadLabelsInDB(threadId, addLabels, removeLabels);

  // Les libellés d'un fil viennent de changer : la liste mise en cache est périmée.
  invalidateThreadsListCache(connectionId);

  const agent = await getZeroSocketAgent(connectionId);
  await agent.invalidateDoStateCache();

  await sendDoState(connectionId);
};

const getActiveShardId = async (connectionId: string) => {
  const cached = activeShardCache.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) return cached.shardId;

  const rememberActiveShard = (shardId: string) => {
    activeShardCache.set(connectionId, {
      shardId,
      expiresAt: Date.now() + SHARD_TOPOLOGY_TTL_MS,
    });
    return shardId;
  };

  const allShards = await listShardsCached(connectionId);

  if (allShards.length === 0) {
    const registry = await getRegistryClient(connectionId);
    const newShardId = crypto.randomUUID();
    await insertShard(registry, newShardId);
    shardListCache.delete(connectionId);
    return rememberActiveShard(newShardId);
  }

  let selectedShardId: string | null = null;
  let minSize = Number.POSITIVE_INFINITY;

  await Promise.all(
    allShards.map(async ({ shard_id: id }) => {
      const shard = await getShardClient(connectionId, id);
      const size = await shard.stub.getDatabaseSize();
      if (size < MAX_SHARD_SIZE && size < minSize) {
        minSize = size;
        selectedShardId = id;
      }
    }),
  );

  if (selectedShardId) {
    return rememberActiveShard(selectedShardId);
  }

  const registry = await getRegistryClient(connectionId);
  const newShardId = crypto.randomUUID();
  await insertShard(registry, newShardId);
  shardListCache.delete(connectionId);
  return rememberActiveShard(newShardId);
};

export const getZeroAgent = async (connectionId: string, executionCtx?: ExecutionContext) => {
  if (!executionCtx) {
    executionCtx = new MockExecutionContext();
  }
  const shardId = await getActiveShardId(connectionId);
  const agent = await getShardClient(connectionId, shardId);

  return agent;
};

export const getZeroAgentFromShard = async (connectionId: string, shardId: string) => {
  const agent = await getShardClient(connectionId, shardId);
  return agent;
};

export const forceReSync = async (connectionId: string) => {
  invalidateShardTopology(connectionId);
  const registry = await getRegistryClient(connectionId);
  const allShards = await listShards(registry);

  await Promise.allSettled(
    allShards.map(async ({ shard_id: id }) => {
      const shard = await getShardClient(connectionId, id);
      await Promise.allSettled([
        shard.exec(`DROP TABLE IF EXISTS threads`),
        shard.exec(`DROP TABLE IF EXISTS thread_labels`),
        shard.exec(`DROP TABLE IF EXISTS labels`),
      ]);
    }),
  );

  await deleteAllShards(registry);
  invalidateShardTopology(connectionId);
  // Les tables de fils viennent d'être supprimées : toute liste en cache est fausse.
  invalidateThreadsListCache(connectionId);

  const agent = await getZeroAgent(connectionId);
  return agent.stub.forceReSync();
};

export const reSyncThread = async (connectionId: string, threadId: string) => {
  try {
    const { shardId } = await getThread(connectionId, threadId);
    const agent = await getZeroAgentFromShard(connectionId, shardId);
    await agent.stub.syncThread({ threadId });
  } catch (error) {
    logger.error(`[ZeroAgent] Thread not found for threadId: ${threadId}`, error);
  }
};

export const getThreadsFromDB = async (
  connectionId: string,
  params: {
    labelIds?: string[];
    folder?: string;
    q?: string;
    maxResults?: number;
    pageToken?: string;
  },
): Promise<IGetThreadsResponse> => {
  // Fire and forget - don't block the thread query on state updates
  //   const agent = await getZeroSocketAgent(connectionId);
  //   await agent.invalidateDoStateCache();
  if (!doStateThrottle.get(connectionId)) {
    doStateThrottle.set(connectionId, true);
    void sendDoState(connectionId);
  }

  const maxResults = params.maxResults ?? defaultPageSize;

  // Only the DO projection path is cacheable: live Gmail search (q) and drafts
  // go through other routes and must stay fresh.
  const cacheable = !params.q && params.folder !== FOLDERS.DRAFT;
  const cacheKey = cacheable
    ? `v${threadsListVersion(connectionId)}:${connectionId}:${params.folder ?? ''}:${maxResults}:${params.pageToken ?? ''}:${[...(params.labelIds ?? [])].sort().join(',')}`
    : null;
  const cached = cacheKey ? threadsListCache.get(cacheKey) : undefined;
  if (cached) return cached;

  const store = (response: IGetThreadsResponse) => {
    if (cacheKey) threadsListCache.set(cacheKey, response);
    return response;
  };

  if (maxResults === defaultPageSize && !params.pageToken && !params.q) {
    const response = await Effect.promise(async () => {
      const agent = await getZeroAgent(connectionId);
      return await agent.stub.getThreadsFromDB({
        ...params,
        maxResults: maxResults,
      });
    }).pipe(Effect.runPromise);
    return store(response);
  }

  const aggregated = await Effect.runPromise(
    aggregateShardDataEffect<IGetThreadsResponse>(
      connectionId,
      (shard) =>
        Effect.promise(() =>
          shard.stub.getThreadsFromDB({
            ...params,
            maxResults: maxResults,
          }),
        ),
      (shardResults) => {
        // Combine all threads from all shards
        const allThreads = shardResults.flatMap((result) => result.threads);

        // Sort by some criteria if needed (assuming threads have a sortable field)
        // allThreads.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

        // Take only the requested amount
        const threads = allThreads.slice(0, maxResults);

        // Determine if there's a next page token (simplified logic)
        const hasMoreResults = allThreads.length > maxResults;
        const nextPageToken = hasMoreResults
          ? shardResults.find((r) => r.nextPageToken)?.nextPageToken || null
          : null;

        return {
          threads,
          nextPageToken,
        };
      },
    ),
  );
  return store(aggregated);
};

export const getDatabaseSize = async (connectionId: string): Promise<number> => {
  return Effect.runPromise(
    aggregateShardDataEffect<number>(
      connectionId,
      (shard) => Effect.promise(() => shard.stub.getDatabaseSize()),
      (sizes) => sizes.reduce((total, shardSize) => total + shardSize, 0),
    ),
  );
};

export const deleteAllSpam = async (connectionId: string) => {
  const result = await Effect.runPromise(
    aggregateShardDataEffect<{ deletedCount: number }>(
      connectionId,
      (shard) => Effect.promise(() => shard.stub.deleteAllSpam()),
      (results) => ({
        deletedCount: results.reduce((total, result) => total + result.deletedCount, 0),
      }),
    ),
  );
  // Des fils viennent d'être supprimés : la liste en cache ne les reflète pas.
  invalidateThreadsListCache(connectionId);
  return result;
};

type CountResult = { label: string; count: number };

const getCounts = async (connectionId: string): Promise<CountResult[]> => {
  const shardCountArrays = await Effect.runPromise(
    aggregateShardDataEffect<CountResult[]>(
      connectionId,
      (shard) => Effect.promise(() => shard.stub.count()),
      (results) => results.flat(),
    ),
  );

  const countMap = new Map<string, number>();
  for (const { label, count } of shardCountArrays) {
    countMap.set(label, (countMap.get(label) || 0) + count);
  }
  return Array.from(countMap, ([label, count]) => ({ label, count }));
};

/**
 * Cannot be called by a shard, can only be called by the Worker
 * @param connectionId
 * @returns
 */
export const sendDoState = async (connectionId: string) => {
  try {
    const agent = await getZeroSocketAgent(connectionId);

    const cached = await agent.getCachedDoState();
    if (cached) {
      logger.info(`[sendDoState] Using cached data for connection ${connectionId}`);
      return agent.broadcastChatMessage({
        type: OutgoingMessageType.Do_State,
        isSyncing: false,
        syncingFolders: ['inbox'],
        storageSize: cached.storageSize,
        counts: cached.counts,
        shards: cached.shards,
      });
    }

    logger.info(`[sendDoState] Cache miss, collecting fresh data for connection ${connectionId}`);
    const [registry, size, counts] = await Promise.all([
      getRegistryClient(connectionId),
      getDatabaseSize(connectionId),
      getCounts(connectionId),
    ]);
    const shards = await listShards(registry);

    await agent.setCachedDoState(size, counts, shards.length);

    return agent.broadcastChatMessage({
      type: OutgoingMessageType.Do_State,
      isSyncing: false,
      syncingFolders: ['inbox'],
      storageSize: size,
      counts,
      shards: shards.length,
    });
  } catch (error) {
    logger.error(`[sendDoState] Failed to send do state for connection ${connectionId}:`, error);
  }
};

export const getZeroSocketAgent = async (connectionId: string) => {
  const stub = env.ZERO_AGENT.get(env.ZERO_AGENT.idFromName(connectionId));
  return stub;
};

export const connectionToDriver = (activeConnection: typeof connection.$inferSelect) => {
  if (!activeConnection.accessToken || !activeConnection.refreshToken) {
    // Une connexion sans jeton n'est pas récupérable par un rejeu : c'est un octroi à
    // refaire. Le code stable remplace le `err.message.includes('Invalid connection')`
    // que le client comparait à travers le réseau.
    throw AppError.connectionExpired(`Invalid connection ${JSON.stringify(activeConnection?.id)}`);
  }

  return createDriver(activeConnection.providerId, {
    auth: {
      userId: activeConnection.userId,
      accessToken: activeConnection.accessToken,
      refreshToken: activeConnection.refreshToken,
      email: activeConnection.email,
    },
  });
};

/**
 * Autorise une notification push Pub/Sub. La vérification réelle (signature JWKS Google +
 * revendications iss/email_verified/email/aud) vit dans lib/pubsub-auth.ts ; ici on ne fait
 * que résoudre la politique depuis l'environnement et journaliser un refus.
 */
export const verifyToken = async (token: string | undefined) => {
  const result = await verifyPubSubToken(token, resolvePubSubTokenPolicy());
  if (!result.ok) {
    logger.warn('[PUBSUB_AUTH] rejected push notification token', { reason: result.reason });
  }
  return result.ok;
};

export const resetConnection = async (connectionId: string) => {
  // Route through the ZeroDB DO (not a direct Hyperdrive write) so its in-memory
  // active-connection cache is invalidated by the update.
  // `withDb` : le `conn.end()` d'origine ne s'exécutait que si la requête aboutissait.
  const row = await withDb(env.HYPERDRIVE.connectionString, (db) =>
    db.query.connection.findFirst({
      where: eq(connection.id, connectionId),
    }),
  );
  if (!row) return;

  const zeroDb = await getZeroDB(row.userId);
  await zeroDb.updateConnection(connectionId, {
    accessToken: null,
    refreshToken: null,
  });
};
