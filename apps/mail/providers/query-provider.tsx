import {
  MutationCache,
  QueryCache,
  QueryClient,
  hashKey,
  type InfiniteData,
  type Mutation,
} from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { selectQueriesForPersistence, shouldPersistQuery } from '@/lib/query-persistence';
import { readRetryDelay, shouldRetryRead } from '@/lib/query-retry';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { requiresReauthorization } from '@/lib/error-codes';
import { signOut, useSession } from '@/lib/auth-client';
import type { AppRouter } from '@zero/server/trpc';
import { CACHE_BURST_KEY } from '@/lib/constants';
import { get, set, del, keys } from 'idb-keyval';
import { m } from '@/paraglide/messages';
import superjson from 'superjson';
import { log } from '@/lib/log';
import { toast } from 'sonner';

const QUERY_CACHE_PREFIX = 'zero-query-cache';

// Purge persisted query caches that do not belong to the current user+account:
// - on logout (anonymous owner): every persisted cache is removed;
// - on account/user switch: caches of other owners are removed.
// Runs once per owner per session. Only runs once the session has resolved so a
// cold load never wipes the real user's cache before auth completes.
const purgedOwners = new Set<string>();
function purgeForeignQueryCaches(currentKey: string, isAuthenticated: boolean) {
  if (purgedOwners.has(currentKey)) return;
  purgedOwners.add(currentKey);
  void keys()
    .then((allKeys) =>
      Promise.all(
        allKeys.flatMap((key) => {
          if (typeof key !== 'string' || !key.startsWith(QUERY_CACHE_PREFIX)) return [];
          if (isAuthenticated && key === currentKey) return [];
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

/**
 * Retour utilisateur sur échec de mutation.
 *
 * Une mutation qui échoue est une ACTION de l'utilisateur qui n'a pas eu lieu (envoi,
 * archivage, suppression). Le `onError` global se contentait de `log.error(err.message)` :
 * la console voyait l'échec, l'utilisateur ne voyait rien et croyait son action passée.
 *
 * Précédence, du plus explicite au plus général :
 *  1. `meta.silentError === true` — la mutation demande explicitement le silence ;
 *  2. `meta.errorMessage` (string) — message imposé par l'appelant, gagne sur tout ;
 *  3. la mutation déclare son propre `onError` — elle possède déjà son retour utilisateur,
 *     on ne double pas le toast (c'est le cas de mail-content, prompts-dialog,
 *     settings/connections, settings/danger-zone, queue-review) ;
 *  4. sinon, toast générique.
 *
 * Rendu ici plutôt que dans `defaultOptions.mutations.onError` parce que ce dernier est
 * ÉCRASÉ (et non complété) par le `onError` d'une mutation : les mutations qui gèrent leur
 * erreur n'étaient alors même plus journalisées. Le `MutationCache` voit tout, meta comprise.
 */
export function resolveMutationErrorToast(
  mutation: Mutation<unknown, unknown, unknown> | undefined,
  fallback: string,
): string | null {
  const meta = mutation?.options.meta;
  if (meta?.silentError === true) return null;
  if (typeof meta?.errorMessage === 'string') return meta.errorMessage;
  if (typeof mutation?.options.onError === 'function') return null;
  return fallback;
}

export const makeQueryClient = (cacheOwner: string) =>
  new QueryClient({
    mutationCache: new MutationCache({
      onError: (err, _variables, _context, mutation) => {
        log.error(err.message || 'Mutation failed');
        const message = resolveMutationErrorToast(
          mutation,
          m['common.actions.errorTryAgainLater'](),
        );
        if (message) toast.error(message);
      },
    }),
    queryCache: new QueryCache({
      onError: (err, { meta }) => {
        if (meta && meta.noGlobalError === true) return;
        if (meta && typeof meta.customError === 'string') log.error(meta.customError);
        // Discrimination sur le CODE stable publié par le serveur, plus sur le texte du
        // message : un libellé reformulé cassait la reconnexion, et une erreur non liée
        // portant la même sous-chaîne déconnectait à tort. Cf. @/lib/error-codes.
        else if (requiresReauthorization(err)) {
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
        // Le retour d'erreur (log + toast) vit dans le `mutationCache` ci-dessus : ici il
        // serait écrasé par toute mutation déclarant son propre `onError`.
      },
    },
  });

const browserQueryClient = {
  queryClient: null,
  activeCacheOwner: null,
} as {
  queryClient: QueryClient | null;
  activeCacheOwner: string | null;
};

const getQueryClient = (cacheOwner: string) => {
  if (typeof window === 'undefined') {
    return makeQueryClient(cacheOwner);
  } else {
    if (!browserQueryClient.queryClient || browserQueryClient.activeCacheOwner !== cacheOwner) {
      browserQueryClient.queryClient = makeQueryClient(cacheOwner);
      browserQueryClient.activeCacheOwner = cacheOwner;
    }
    return browserQueryClient.queryClient;
  }
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
      fetch: (url, options) =>
        fetch(url, { ...options, credentials: 'include' }).then((res) => {
          const currentPath = new URL(window.location.href).pathname;
          const redirectPath = res.headers.get('X-Zero-Redirect');
          if (!!redirectPath && redirectPath !== currentPath) {
            window.location.href = redirectPath;
            res.headers.delete('X-Zero-Redirect');
          }
          return res;
        }),
    }),
  ],
});

type TrpcHook = ReturnType<typeof useTRPC>;
export function QueryProvider({
  children,
  connectionId,
}: PropsWithChildren<{ connectionId: string | null }>) {
  const { data: session, isPending: isSessionPending } = useSession();
  const cacheOwner = `${session?.user.id ?? 'anonymous'}-${connectionId ?? 'default'}`;
  const persister = useMemo(
    () => createIDBPersister(`zero-query-cache-${cacheOwner}`),
    [cacheOwner],
  );
  const queryClient = useMemo(() => getQueryClient(cacheOwner), [cacheOwner]);

  // Purge other users'/accounts' persisted caches on switch, and all of them on
  // logout — but only once the session has resolved, so a cold load never wipes
  // the signed-in user's cache before auth completes.
  useEffect(() => {
    if (isSessionPending) return;
    purgeForeignQueryCaches(`zero-query-cache-${cacheOwner}`, Boolean(session?.user.id));
  }, [isSessionPending, cacheOwner, session?.user.id]);

  return (
    <PersistQueryClientProvider
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
        // invalidate the query, it will refetch when the data is it is being accessed
        queryClient.invalidateQueries({ queryKey: threadQueryKey });
      }}
    >
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}
