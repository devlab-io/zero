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
  /**
   * r16 : deep-link lecteur. Preuve CUA staging (4e730554) : un reload sur un
   * fil DÉJÀ LU repartait en openThread réseau (data-ready 6499 ms) — les
   * corps n'étaient hydratés qu'après paint+idle, APRÈS le départ du queryFn.
   * Quand cette fonction rend un threadId (URL ?threadId=…), le restore
   * BLOQUANT fusionne l'entrée mail.get de CE fil et ses email-content depuis
   * le blob détails : le lecteur monte cache chaud, staleTime/refetchOnMount
   * (hasCompleteThreadBodies) concluent zéro réseau. Les autres corps restent
   * hydratés à l'idle, inchangé.
   */
  getPriorityThreadId?: () => string | null;
};

/** ?threadId=… de l'URL — seul état fiable AVANT montage React (nuqs). */
export function readPriorityThreadIdFromSearch(search: string): string | null {
  try {
    const threadId = new URLSearchParams(search).get('threadId');
    return threadId && threadId.trim().length > 0 ? threadId : null;
  } catch {
    return null;
  }
}

type ThreadDetailData = {
  messages?: { id?: string }[];
  latest?: { id?: string };
};

/**
 * Sélection pure des entrées à restaurer en PRIORITÉ pour un fil : la query
 * mail.get du fil, puis les email-content de SES messages (l'association
 * threadId→messageIds vit dans la donnée mail.get persistée). Vide si le fil
 * n'est pas dans le blob — le lecteur retombe alors sur le réseau, comme un
 * cache froid honnête.
 */
export function selectPriorityDetailQueries<T extends PersistableQuery>(
  queries: readonly T[],
  threadId: string,
): T[] {
  const threadQuery = queries.find((query) => {
    const path = query.queryKey[0];
    if (!Array.isArray(path) || path.join('.') !== 'mail.get') return false;
    const input = (query.queryKey[1] as { input?: { id?: string } } | undefined)?.input;
    return input?.id === threadId;
  });
  if (!threadQuery) return [];

  const data = threadQuery.state.data as ThreadDetailData | null | undefined;
  const messageIds = new Set(
    [...(data?.messages ?? []).map((message) => message?.id), data?.latest?.id].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    ),
  );
  const contentQueries = queries.filter(
    (query) =>
      query.queryKey[0] === 'email-content' &&
      typeof query.queryKey[2] === 'string' &&
      messageIds.has(query.queryKey[2]),
  );
  return [threadQuery, ...contentQueries];
}

export type SplitPersister = {
  persister: Persister;
  /** Lecture différée des corps persistés — à hydrater APRÈS le premier paint. */
  restoreDetails: () => Promise<PersistedClient['clientState']['queries'] | null>;
};

/**
 * Empreinte bon marché du lot détails : longueur + max + somme des
 * dataUpdatedAt. Toute modification réelle d'un corps bump son dataUpdatedAt →
 * l'empreinte change ; à empreinte identique, la réécriture (structured clone
 * de plusieurs Mo vers IDB) est SAUTÉE — r11 : l'hydratation différée marquait
 * le cache « modifié » et redéclenchait l'écriture du blob lourd en rafale.
 */
export function detailsFingerprint(queries: readonly PersistableQuery[]): string {
  let max = 0;
  let sum = 0;
  for (const query of queries) {
    const at = query.state.dataUpdatedAt ?? 0;
    if (at > max) max = at;
    sum += at;
  }
  return `${queries.length}:${max}:${sum}`;
}

export function createSplitIDBPersister(
  storage: SplitPersisterStorage,
  mainKey: string,
  options: SplitPersisterOptions,
): SplitPersister {
  const detailsKey = `${mainKey}${DETAILS_KEY_SUFFIX}`;
  let lastDetailsFingerprint: string | null = null;

  // Validation partagée de l'enveloppe détails (âge/buster/forme). Invalide :
  // null — l'appelant supprime le blob, jamais hydraté (fallback réseau).
  const readValidDetailQueries = (
    stored: PersistedClient | undefined,
  ): PersistedClient['clientState']['queries'] | null => {
    const queries = stored?.clientState?.queries;
    const isValid =
      stored != null &&
      typeof stored.timestamp === 'number' &&
      Date.now() - stored.timestamp < options.maxAgeMs &&
      stored.buster === options.buster &&
      Array.isArray(queries);
    return isValid ? queries : null;
  };

  // P0 3B (secret-cache) : les mutations ne touchent JAMAIS le disque — ni à
  // l'écriture (les deux blobs les vident) ni à la restauration (un blob
  // legacy/forgé qui en contiendrait est assaini avant hydratation). Les
  // `variables` d'une mutation peuvent porter un secret (clé BYOK).
  const stripMutations = (stored: PersistedClient | undefined): PersistedClient | undefined =>
    stored ? { ...stored, clientState: { ...stored.clientState, mutations: [] } } : stored;

  return {
    persister: {
      persistClient: async (client: PersistedClient) => {
        const raw = client.clientState.queries as unknown as PersistableQuery[];
        // r11 (contre-revue) : PARTITION AVANT toute sérialisation —
        // isDetailQuery n'inspecte que la clé. selectQueriesForPersistence
        // JSON.stringify chaque détail (limite 3 Mo + budget 8 Mo) à chaque
        // événement cache : ce coût CPU (le jank principal) n'est payé que si
        // l'empreinte bon marché des détails (dataUpdatedAt seuls, jamais
        // state.data) a réellement changé.
        const [rawCritical, rawDetails] = splitPersistedQueries(raw);
        const fingerprint = detailsFingerprint(rawDetails);
        const writes: Promise<unknown>[] = [
          storage.set(mainKey, {
            ...client,
            clientState: {
              ...client.clientState,
              // Défense en profondeur : même si le provider déshydratait des
              // mutations, elles n'atteignent jamais IndexedDB.
              mutations: [],
              queries: selectQueriesForPersistence(rawCritical),
            },
          }),
        ];
        if (fingerprint !== lastDetailsFingerprint) {
          // Budget/limites appliqués SEULEMENT maintenant, sur les détails
          // modifiés. Contre-revue r10 (P0) : enveloppe PersistedClient propre
          // (timestamp + buster) — le restore différé ne contourne jamais
          // maxAge/buster.
          const details = selectQueriesForPersistence(rawDetails);
          writes.push(
            storage.set(detailsKey, {
              timestamp: Date.now(),
              buster: options.buster,
              clientState: {
                mutations: [],
                queries: details as unknown as PersistedClient['clientState']['queries'],
              },
            } satisfies PersistedClient),
          );
          lastDetailsFingerprint = fingerprint;
        }
        await Promise.all(writes);
      },
      restoreClient: async () => {
        // Blob legacy (pré-scission) : restauré tel quel — lent une dernière
        // fois, réécrit scindé au prochain persist. Blob scindé : listes
        // seules, le restore bloquant devient petit et rapide. La validation
        // âge/buster du blob principal reste faite par persistQueryClient.
        const priorityThreadId = options.getPriorityThreadId?.() ?? null;
        if (!priorityThreadId) {
          return stripMutations((await storage.get(mainKey)) as PersistedClient | undefined);
        }

        // r16 : deep-link — le fil de l'URL est fusionné dans le restore
        // BLOQUANT (voir SplitPersisterOptions.getPriorityThreadId). Coût payé
        // uniquement sur un reload avec ?threadId : lecture+parse du blob
        // détails avant la levée du restore.
        const [main, storedDetails] = await Promise.all([
          storage.get(mainKey) as Promise<PersistedClient | undefined>,
          storage.get(detailsKey) as Promise<PersistedClient | undefined>,
        ]);
        const detailQueries = readValidDetailQueries(storedDetails);
        if (detailQueries === null) {
          // Périmé/corrompu : supprimé, restore listes seules — le lecteur
          // retombe sur le réseau (fallback honnête, jamais de blob mensonger).
          if (storedDetails != null) await storage.del(detailsKey).catch(() => {});
          return stripMutations(main);
        }

        const priority = selectPriorityDetailQueries(
          detailQueries as unknown as PersistableQuery[],
          priorityThreadId,
        ) as unknown as PersistedClient['clientState']['queries'];
        if (priority.length === 0) return stripMutations(main);
        if (!main) {
          // Listes absentes mais fil demandé présent : enveloppe détails
          // (timestamp/buster déjà validés) portant les seules entrées du fil.
          return {
            timestamp: (storedDetails as PersistedClient).timestamp,
            buster: options.buster,
            clientState: { mutations: [], queries: priority },
          } satisfies PersistedClient;
        }
        return {
          ...main,
          clientState: {
            ...main.clientState,
            mutations: [],
            queries: [...main.clientState.queries, ...priority],
          },
        };
      },
      removeClient: async () => {
        await Promise.all([storage.del(mainKey), storage.del(detailsKey)]);
      },
    },
    restoreDetails: async () => {
      const stored = (await storage.get(detailsKey)) as PersistedClient | undefined;
      const queries = readValidDetailQueries(stored);
      if (queries === null) {
        // Périmé, buster d'un autre build, ou forme legacy/corrompue :
        // supprimé — jamais hydraté.
        if (stored != null) await storage.del(detailsKey).catch(() => {});
        return null;
      }
      return queries.length > 0 ? queries : null;
    },
  };
}
