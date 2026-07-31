import {
  getActiveConnectionId,
  getConnectionEpoch,
  isStaleConnectionResponse,
  setActiveConnectionId,
  subscribeActiveConnection,
  StaleConnectionResponseError,
} from '@/lib/active-connection-store';
import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import {
  readCacheOwnerHint,
  writeCacheOwnerHint,
  clearCacheOwnerHint,
} from '@/lib/cache-owner-hint';
import { QueryCache, QueryClient, hashKey, type InfiniteData } from '@tanstack/react-query';
import { selectQueriesForPersistence, shouldPersistQuery } from '@/lib/query-persistence';
import { useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { readRetryDelay, shouldRetryRead } from '@/lib/query-retry';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { acquireQueryClient } from '@/lib/query-client-pool';
import { signOut, useSession } from '@/lib/auth-client';
import type { AppRouter } from '@zero/server/trpc';
import { CACHE_BURST_KEY } from '@/lib/constants';
import { useQuery } from '@tanstack/react-query';
import { get, set, del, keys } from 'idb-keyval';
import superjson from 'superjson';
import { log } from '@/lib/log';

const QUERY_CACHE_PREFIX = 'zero-query-cache';

// Purge persisted query caches that do not belong to the current USER:
// - on logout (anonymous owner): every persisted cache is removed;
// - on user switch: caches of other users are removed.
// Caches of the current user's OTHER connections are KEPT on purpose: the
// admin→Thomas→admin switch must find admin's cache intact (per-account
// isolation, Shortwave parity). Runs once per owner per session, only once the
// session has resolved so a cold load never wipes a cache before auth completes.
const purgedOwners = new Set<string>();
function purgeForeignQueryCaches(currentUserPrefix: string, isAuthenticated: boolean) {
  if (purgedOwners.has(currentUserPrefix)) return;
  purgedOwners.add(currentUserPrefix);
  void keys()
    .then((allKeys) =>
      Promise.all(
        allKeys.flatMap((key) => {
          if (typeof key !== 'string' || !key.startsWith(QUERY_CACHE_PREFIX)) return [];
          if (isAuthenticated && key.startsWith(currentUserPrefix)) return [];
          return [del(key)];
        }),
      ),
    )
    .catch((error) => log.warn('Failed to purge stale query caches', error));
}

function createIDBPersister(idbValidKey: IDBValidKey = 'zero-query-cache') {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbValidKey, {
        ...client,
        clientState: {
          ...client.clientState,
          queries: selectQueriesForPersistence(client.clientState.queries),
        },
      });
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbValidKey);
    },
    removeClient: async () => {
      await del(idbValidKey);
    },
  } satisfies Persister;
}

export const makeQueryClient = (cacheOwner: string) =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (err, { meta }) => {
        if (meta && meta.noGlobalError === true) return;
        if (meta && typeof meta.customError === 'string') log.error(meta.customError);
        else if (
          err.message === 'Required scopes missing' ||
          err.message.includes('Invalid connection')
        ) {
          signOut({
            fetchOptions: {
              onSuccess: () => {
                if (window.location.href.includes('/login')) return;
                window.location.href = '/login?error=required_scopes_missing';
              },
            },
          });
        } else log.error(err.message || 'Something went wrong');
      },
    }),
    defaultOptions: {
      queries: {
        // Reads (idempotent) retry at most twice with capped exponential jitter
        // (issue #34, check point 4). Mutations are non-idempotent and keep the
        // react-query default of zero retries — see `mutations` below.
        retry: shouldRetryRead,
        retryDelay: readRetryDelay,
        refetchOnWindowFocus: false,
        queryKeyHashFn: (queryKey) => hashKey([{ cacheOwner }, ...queryKey]),
        gcTime: 1000 * 60 * 60 * 24, // 24 hours,
      },
      mutations: {
        // No `retry` here on purpose: non-idempotent mutations must not auto-retry.
        onError: (err) => log.error(err.message),
      },
    },
  });

// Voir lib/query-client-pool.ts : un QueryClient retenu par compte — caches
// isolés et chauds, admin→Thomas→admin instantané au retour.
const queryClientPool = new Map<string, QueryClient>();

const getQueryClient = (cacheOwner: string) => {
  if (typeof window === 'undefined') {
    return makeQueryClient(cacheOwner);
  }
  return acquireQueryClient(cacheOwner, makeQueryClient, queryClientPool);
};

const getUrl = () => import.meta.env.VITE_PUBLIC_BACKEND_URL + '/api/trpc';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    // loggerLink({ enabled: () => true }),
    httpBatchLink({
      transformer: superjson,
      url: getUrl(),
      methodOverride: 'POST',
      fetch: (url, options) => {
        // Fence epoch : une réponse dont l'émission précède un switch de compte
        // ne doit alimenter AUCUN cache — le serveur résout le compte via le
        // cookie de connexion active, donc une réponse qui a chevauché le
        // basculement peut porter les données de n'importe quel côté.
        const issuedEpoch = getConnectionEpoch();
        return fetch(url, { ...options, credentials: 'include' }).then((res) => {
          if (isStaleConnectionResponse(issuedEpoch, getConnectionEpoch())) {
            throw new StaleConnectionResponseError();
          }
          const currentPath = new URL(window.location.href).pathname;
          const redirectPath = res.headers.get('X-Zero-Redirect');
          if (!!redirectPath && redirectPath !== currentPath) {
            window.location.href = redirectPath;
            res.headers.delete('X-Zero-Redirect');
          }
          return res;
        });
      },
    }),
  ],
});

type TrpcHook = ReturnType<typeof useTRPC>;

// Rapproche le store client de la vérité serveur : si la connexion active
// serveur diffère du hint local (switch fait ailleurs, connexion révoquée), le
// store bascule — le provider swappe alors client/persister et l'epoch avancé
// rejette les réponses parties sous l'ancienne hypothèse.
function ActiveConnectionBridge() {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.connections.getDefault.queryOptions(void 0, {
      meta: { noGlobalError: true },
    }),
  );
  useEffect(() => {
    if (data?.id && data.id !== getActiveConnectionId()) {
      setActiveConnectionId(data.id);
    }
  }, [data?.id]);
  return null;
}

export function QueryProvider({ children }: PropsWithChildren) {
  const { data: session, isPending: isSessionPending } = useSession();
  // Connexion active réelle (store client, hydraté du hint localStorage au boot,
  // mis à jour par le switch de compte et la bridge serveur). L'ancien montage
  // avec connectionId={null} figeait le scope sur `user-default` : aucun compte
  // n'était réellement isolé.
  const connectionId = useSyncExternalStore(
    subscribeActiveConnection,
    getActiveConnectionId,
    () => null,
  );
  const resolvedCacheOwner = `${session?.user.id ?? 'anonymous'}-${connectionId ?? 'default'}`;

  // Devlab (perf) : pendant que useSession() résout, cacheOwner valait
  // "anonymous-<connectionId>", ce qui recréait un QueryClient + persister
  // IndexedDB neufs (getQueryClient) au moment où la session bascule vers le
  // vrai user id — la première vague de requêtes est jetée et repart
  // (régime établi 2,7 s, dont cette seconde vague). Le hint n'est utilisé
  // que si son suffixe connectionId correspond au connectionId courant :
  // sinon la clé de persister `zero-query-cache-${cacheOwner}` servirait le
  // cache IndexedDB d'une autre connexion.
  const currentConnectionSuffix = `-${connectionId ?? 'default'}`;
  const cacheOwnerHint = isSessionPending ? readCacheOwnerHint() : null;
  const cacheOwner =
    cacheOwnerHint && cacheOwnerHint.endsWith(currentConnectionSuffix)
      ? cacheOwnerHint
      : resolvedCacheOwner;

  const persister = useMemo(
    () => createIDBPersister(`zero-query-cache-${cacheOwner}`),
    [cacheOwner],
  );
  const queryClient = useMemo(() => getQueryClient(cacheOwner), [cacheOwner]);

  // Une fois la session résolue : garde le hint à jour (utilisateur connu)
  // ou l'efface (déconnecté), pour la prochaine navigation/boot.
  useEffect(() => {
    if (isSessionPending) return;
    if (session?.user.id) writeCacheOwnerHint(resolvedCacheOwner);
    else clearCacheOwnerHint();
  }, [isSessionPending, resolvedCacheOwner, session?.user.id]);

  // Purge des caches persistés des AUTRES utilisateurs (tous sur logout). Les
  // caches des autres connexions du même utilisateur sont conservés : c'est ce
  // qui rend admin→Thomas→admin instantané au retour.
  useEffect(() => {
    if (isSessionPending) return;
    purgeForeignQueryCaches(
      `${QUERY_CACHE_PREFIX}-${session?.user.id ?? 'anonymous'}-`,
      Boolean(session?.user.id),
    );
  }, [isSessionPending, session?.user.id]);

  return (
    <PersistQueryClientProvider
      key={cacheOwner}
      client={queryClient}
      persistOptions={{
        persister,
        buster: CACHE_BURST_KEY,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
      onSuccess={() => {
        const threadQueryKey = [['mail', 'listThreads'], { type: 'infinite' }];
        queryClient.setQueriesData(
          { queryKey: threadQueryKey },
          (data: InfiniteData<TrpcHook['mail']['listThreads']['~types']['output']>) => {
            if (!data) return data;
            // We only keep few pages of threads in the cache before we invalidate them
            // invalidating will attempt to refetch every page that was in cache, if someone have too many pages in cache, it will refetch every page every time
            // We don't want that, just keep like 3 pages (20 * 3 = 60 threads) in cache
            return {
              pages: data.pages.slice(0, 3),
              pageParams: data.pageParams.slice(0, 3),
            };
          },
        );
        // Refresh only the folder that is already on screen. Invalidating every
        // restored folder made inactive Inbox/Draft/Bin caches stale at boot;
        // the first later click then discarded the warm list and paid another
        // network/DO trip. Websocket invalidations still keep inactive folders
        // coherent while the app is open, and their own staleTime bounds a cache
        // restored after a longer absence.
        queryClient.invalidateQueries({
          queryKey: threadQueryKey,
          type: 'active',
          refetchType: 'active',
        });
      }}
    >
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {session?.user.id ? <ActiveConnectionBridge /> : null}
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}
