import {
  isDetailQuery,
  selectQueriesForPersistence,
  type PersistableQuery,
} from './query-persistence';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

/**
 * Persister IDB SCINDÉ (r10, cold boot). Mesure CUA staging : le shell est
 * peint vers ~0,7 s mais les threads n'apparaissent qu'à ~2,1 s — le gap est
 * entre confirmation de session et peinture de la liste. Le restore
 * monolithique en était une moitié : PersistQueryClientProvider bloque TOUTES
 * les requêtes tant que le restore n'est pas fini, et le blob unique portait
 * jusqu'à ~8 Mo de corps de mails (budget détails) alors que la première
 * liste n'a besoin que de quelques Ko de pages listThreads.
 *
 * Scission par nature de requête (même couture isDetailQuery que les budgets) :
 *   - clé principale  `zero-query-cache-<owner>`            : listes + état app
 *     (petit) — restaurée de façon BLOQUANTE, la liste peint immédiatement ;
 *   - clé détails     `zero-query-cache-<owner>::details`   : corps de mails
 *     (lourd) — hydratée EN ARRIÈRE-PLAN après le premier paint, via
 *     restoreDetails() branché dans le onSuccess du provider.
 * Un lecteur ouvert avant l'hydratation des détails retombe sur le réseau,
 * comme un cache froid — aucune donnée mensongère, juste un cache plus tardif.
 *
 * Le suffixe `::details` PRÉSERVE le préfixe `zero-query-cache-<userId>-` :
 * la purge des caches étrangers (logout/switch) voit les deux clés comme
 * appartenant au même owner. Migration : un blob legacy (pré-scission) est
 * restauré tel quel (lent une dernière fois) puis réécrit scindé au prochain
 * persist — convergence sans perte.
 */

export type SplitPersisterStorage = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

export const DETAILS_KEY_SUFFIX = '::details';

/** Scission pure : [critiques (listes/état), détails (corps)] — testée à part. */
export function splitPersistedQueries<T extends PersistableQuery>(queries: T[]): [T[], T[]] {
  const critical: T[] = [];
  const details: T[] = [];
  for (const query of queries) {
    (isDetailQuery(query) ? details : critical).push(query);
  }
  return [critical, details];
}

export type SplitPersisterOptions = {
  /** Même buster que le persister principal (CACHE_BURST_KEY). */
  buster: string;
  /** Même durée de vie que le persister principal (QUERY_PERSIST_MAX_AGE_MS). */
  maxAgeMs: number;
};

export type SplitPersister = {
  persister: Persister;
  /** Lecture différée des corps persistés — à hydrater APRÈS le premier paint. */
  restoreDetails: () => Promise<PersistedClient['clientState']['queries'] | null>;
};

export function createSplitIDBPersister(
  storage: SplitPersisterStorage,
  mainKey: string,
  options: SplitPersisterOptions,
): SplitPersister {
  const detailsKey = `${mainKey}${DETAILS_KEY_SUFFIX}`;

  return {
    persister: {
      persistClient: async (client: PersistedClient) => {
        const selected = selectQueriesForPersistence(
          client.clientState.queries as unknown as PersistableQuery[],
        );
        const [critical, details] = splitPersistedQueries(selected);
        await Promise.all([
          storage.set(mainKey, {
            ...client,
            clientState: { ...client.clientState, queries: critical },
          }),
          // Contre-revue r10 (P0) : les détails portent leur PROPRE enveloppe
          // PersistedClient (timestamp + buster) — le restore différé ne doit
          // jamais contourner maxAge/buster : un blob périmé ou d'un ancien
          // build serait sinon hydraté même après rejet du blob principal.
          storage.set(detailsKey, {
            timestamp: Date.now(),
            buster: options.buster,
            clientState: {
              mutations: [],
              queries: details as unknown as PersistedClient['clientState']['queries'],
            },
          } satisfies PersistedClient),
        ]);
      },
      restoreClient: async () => {
        // Blob legacy (pré-scission) : restauré tel quel — lent une dernière
        // fois, réécrit scindé au prochain persist. Blob scindé : listes
        // seules, le restore bloquant devient petit et rapide. La validation
        // âge/buster du blob principal reste faite par persistQueryClient.
        return (await storage.get(mainKey)) as PersistedClient | undefined;
      },
      removeClient: async () => {
        await Promise.all([storage.del(mainKey), storage.del(detailsKey)]);
      },
    },
    restoreDetails: async () => {
      const stored = (await storage.get(detailsKey)) as PersistedClient | undefined;
      const queries = stored?.clientState?.queries;
      const isValid =
        stored != null &&
        typeof stored.timestamp === 'number' &&
        Date.now() - stored.timestamp < options.maxAgeMs &&
        stored.buster === options.buster &&
        Array.isArray(queries);
      if (!isValid) {
        // Périmé, buster d'un autre build, ou forme legacy/corrompue :
        // supprimé — jamais hydraté.
        if (stored != null) await storage.del(detailsKey).catch(() => {});
        return null;
      }
      return queries.length > 0 ? queries : null;
    },
  };
}
