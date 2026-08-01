import {
  getActiveConnectionId,
  getConnectionEpoch,
  isStaleConnectionResponse,
  setActiveConnectionId,
  subscribeActiveConnection,
  StaleConnectionResponseError,
} from '@/lib/active-connection-store';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  hashKey,
  hydrate,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { useEffect, useMemo, useRef, useSyncExternalStore, type PropsWithChildren } from 'react';
import { createSplitIDBPersister, readPriorityThreadIdFromSearch } from '@/lib/split-persister';
import { QUERY_PERSIST_MAX_AGE_MS, shouldPersistQuery } from '@/lib/query-persistence';
import { seedMailListPageSizeMigration } from '@/lib/mail-list-cache-migration';
import { readCacheOwnerHint, resolveCacheOwner } from '@/lib/cache-owner-hint';
import { registerDetailPersistFlusher } from '@/lib/detail-persist-flush';
import { readRetryDelay, shouldRetryRead } from '@/lib/query-retry';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { scheduleAfterPaintIdle } from '@/lib/idle-scheduler';
import { acquireQueryClient } from '@/lib/query-client-pool';
import { signOut, useSession } from '@/lib/auth-client';
import type { AppRouter } from '@zero/server/trpc';
import { CACHE_BURST_KEY } from '@/lib/constants';
import { useQuery } from '@tanstack/react-query';
import { get, set, del, keys } from 'idb-keyval';
import { markStage } from '@/lib/perf-stages';
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

// r10 : le persister est SCINDÉ (lib/split-persister.ts) — le restore bloquant
// ne porte plus que les listes/état (petit), les corps de mails s'hydratent en
// arrière-plan après le premier paint (voir onSuccess ci-dessous).

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

/**
 * P0 3B (secret-cache) : les MUTATIONS ne sont JAMAIS déshydratées. Les
 * `variables` d'une mutation peuvent porter un payload sensible (clé BYOK) ;
 * une mutation paused (offline) serait sinon écrite dans IndexedDB par le
 * persister. Barrière globale — le flux BYOK est DE PLUS impératif (hors
 * MutationCache), ceci est la défense en profondeur.
 */
export const QUERY_DEHYDRATE_OPTIONS = {
  shouldDehydrateQuery: shouldPersistQuery,
  shouldDehydrateMutation: () => false,
} as const;

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
  // Barrière d'isolation P0 (r6, testée dans lib/cache-owner-hint.test.ts) :
  // tant que userId+connexion ne sont pas CONFIRMÉS par la session, l'identité
  // résolue est anonyme — aucun hint localStorage (non vérifiable : crash,
  // vieux build, storage périmé) ne peut sélectionner le persister d'un autre
  // compte. À la résolution, la clé bascule vers user-connexion et le
  // persister par compte restaure le cache chaud immédiatement.
  const cacheOwner = resolveCacheOwner({
    sessionUserId: session?.user.id ?? null,
    isSessionPending,
    connectionId,
    hint: isSessionPending ? readCacheOwnerHint() : null,
  });
  const isConfirmedIdentity = Boolean(session?.user.id) && !isSessionPending;

  // r10 : persister scindé — restore bloquant = listes/état seuls (petit),
  // corps de mails hydratés en arrière-plan après le premier paint (onSuccess),
  // avec validation buster/âge propre au blob détails (contre-revue P0).
  const { persister, restoreDetails } = useMemo(
    () =>
      createSplitIDBPersister({ get, set, del }, `zero-query-cache-${cacheOwner}`, {
        buster: CACHE_BURST_KEY,
        maxAgeMs: QUERY_PERSIST_MAX_AGE_MS,
        // r16 : deep-link lecteur — le fil de ?threadId est restauré de façon
        // BLOQUANTE (mail.get + email-content de SES messages) : le lecteur
        // monte cache chaud, zéro openThread réseau sur un fil déjà lu. Le
        // persister étant owner-scopé, l'isolation P0 est inchangée.
        getPriorityThreadId: () =>
          typeof window === 'undefined'
            ? null
            : readPriorityThreadIdFromSearch(window.location.search),
      }),
    [cacheOwner],
  );
  const queryClient = useMemo(() => getQueryClient(cacheOwner), [cacheOwner]);

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

  // Jalon boot r9 : identité confirmée (fin de la RTT session, amorcée au
  // parse du HTML par session-prime). Une seule marque par chargement.
  const sessionConfirmedMarkedRef = useRef(false);
  useEffect(() => {
    if (!isConfirmedIdentity || sessionConfirmedMarkedRef.current) return;
    sessionConfirmedMarkedRef.current = true;
    markStage('boot:session-confirmed');
  }, [isConfirmedIdentity]);

  // r9 (cold boot) : pendant la résolution de session, OUVRE le handle IndexedDB
  // (lecture d'une clé constante inexistante — AUCUNE clé user-scopée, aucune
  // donnée restaurée : le contrat P0 est intact). Le restore du persister qui
  // suit la confirmation ne paie plus l'ouverture à froid de la base (~30-80 ms).
  useEffect(() => {
    if (!isSessionPending) return;
    void get('__zero-idb-warm').catch(() => {});
  }, [isSessionPending]);

  // r11 : époque + annulation de l'hydratation différée des corps. Un
  // changement d'owner (switch de compte) ou un démontage invalide et annule
  // tout travail planifié — rien d'un ancien owner ne touche le client suivant.
  const detailsEpochRef = useRef(0);
  const cancelDetailsHydrationRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    detailsEpochRef.current += 1;
    return () => {
      detailsEpochRef.current += 1;
      cancelDetailsHydrationRef.current?.();
      cancelDetailsHydrationRef.current = null;
    };
  }, [cacheOwner]);

  // r16 : flusher de persist immédiat — enregistré pour le couple
  // (owner, persister) COURANT et confirmé seulement. Un openThread réussi
  // demande une écriture explicite (coalescée) au lieu d'attendre l'abonnement
  // throttlé ; au switch/logout le flusher est désenregistré AVANT que le
  // nouveau s'installe — une demande en vol devient no-op, jamais une écriture
  // croisée (isolation P0).
  useEffect(() => {
    if (!isConfirmedIdentity) {
      registerDetailPersistFlusher(null);
      return;
    }
    registerDetailPersistFlusher(() => {
      void persistQueryClientSave({
        queryClient,
        persister,
        buster: CACHE_BURST_KEY,
        dehydrateOptions: QUERY_DEHYDRATE_OPTIONS,
      });
    });
    return () => registerDetailPersistFlusher(null);
  }, [isConfirmedIdentity, queryClient, persister]);

  if (isSessionPending) {
    // Shell NEUTRE structurel (P0 r6) : tant que l'identité n'est pas
    // confirmée, les children ne montent PAS — aucune requête (même servie
    // par cookie) ne peut partir, aucune mailbox ne peut peindre, aucun
    // persister n'est restauré ni écrit. Coût assumé : la première peinture
    // attend la résolution de session ; le persister par compte restaure le
    // cache chaud juste après.
    return (
      <div
        data-testid="identity-pending-shell"
        className="flex h-screen w-full items-center justify-center"
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
      </div>
    );
  }

  if (!isConfirmedIdentity) {
    // Session résolue SANS utilisateur (déconnecté : login, pages publiques) :
    // client mémoire-seule, aucun persister user-scopé restauré ni écrit.
    return (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {children}
        </TRPCProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      key={cacheOwner}
      client={queryClient}
      persistOptions={{
        persister,
        buster: CACHE_BURST_KEY,
        // r7b : 24 h jetait le snapshot entier après un jour sans session —
        // classe de cold boot multi-jour éliminée (cause POSSIBLE du spinner
        // Drafts observé, non certaine) — voir QUERY_PERSIST_MAX_AGE_MS.
        maxAge: QUERY_PERSIST_MAX_AGE_MS,
        dehydrateOptions: QUERY_DEHYDRATE_OPTIONS,
      }}
      onSuccess={() => {
        // r6 : recopie les listes persistées sous l'ancienne clé (20 lignes)
        // vers la clé pages-de-50 — le premier boot post-déploiement peint le
        // snapshot existant au lieu d'être artificiellement froid.
        // Jalon boot r9 : cache owner-scopé restauré — la première liste peut
        // peindre depuis le snapshot local.
        markStage('boot:cache-restored');
        seedMailListPageSizeMigration(queryClient);
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
        // r11 : hydratation des corps RÉELLEMENT différée. onSuccess est
        // AWAITÉ par persistQueryClientRestore AVANT setIsRestoring(false)
        // (code TanStack) : tout travail lancé ici concurrence la levée du
        // restore et la première peinture. On ne fait donc que PLANIFIER —
        // double rAF (un frame peint) puis idle (lib/idle-scheduler) — et le
        // travail est annulé si l'owner change entre-temps (isolation P0).
        // restoreDetails valide buster/âge (blob invalide : supprimé, jamais
        // hydraté) ; `hydrate` respecte dataUpdatedAt : une réponse réseau
        // plus fraîche n'est jamais écrasée (prouvé sur vrai QueryClient).
        const scheduledEpoch = detailsEpochRef.current;
        cancelDetailsHydrationRef.current?.();
        cancelDetailsHydrationRef.current = scheduleAfterPaintIdle(() => {
          if (scheduledEpoch !== detailsEpochRef.current) return;
          void restoreDetails()
            .then((queries) => {
              if (!queries || scheduledEpoch !== detailsEpochRef.current) return;
              hydrate(queryClient, { queries } as Parameters<typeof hydrate>[1]);
              markStage('boot:details-restored');
            })
            .catch(() => {});
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
