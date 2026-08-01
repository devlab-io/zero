import {
  enrichThinItemsWithPreview,
  filterLiteralSearchPreviewItems,
  mergeAuthoritativeWithLocalMatches,
  selectSearchPreviewItems,
} from '@/lib/search-preview-selector';
import {
  findForceSyncSnapshot,
  nextForceSyncHoldPhase,
  selectForceSyncHoldItems,
} from '@/lib/force-sync-hold-selector';
import {
  deactivateForceSyncHoldAtom,
  forceSyncHoldAtom,
  observeForceSyncPurgeAtom,
} from '@/store/force-sync-hold';
import {
  hashKey,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { backgroundQueueAtom, isThreadInBackgroundQueueAtom } from '@/store/backgroundQueue';
import { emailContentQueryKey, resolveEmailContentTheme } from '@/lib/email-content-query';
import { extractCollabFilters, filterThreadsByCollabSets } from '@/lib/collab-search';
import { requestImmediateDetailPersist } from '@/lib/detail-persist-flush';
import { canReuseMailListPlaceholder } from '@/lib/mail-list-placeholder';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { hasCompleteThreadBodies } from '@/lib/thread-detail-cache';
import { recordOpenThreadTimings } from '@/lib/open-thread-timing';
import { MAIL_LIST_QUERY_BEHAVIOR } from '@/lib/mail-list-query';
import { isSimpleLiteralSearch } from '@/lib/search-intent';
import { mailListMaxResults } from '@/lib/mail-pagination';
import { useSearchValue } from '@/hooks/use-search-value';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCollabThreadSets } from '@/hooks/use-teams';
import { useCallback, useEffect, useMemo } from 'react';
import type { IGetThreadResponse } from '@zero/types';
import useSearchLabels from './use-labels-search';
import { useSession } from '@/lib/auth-client';
import { useSettings } from './use-settings';
import { useParams } from 'react-router';
import { useTheme } from 'next-themes';
import { useQueryState } from 'nuqs';

const THREAD_STALE_MS = 60 * 60 * 1000;

function useOpenThreadQueryOptions() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { resolvedTheme } = useTheme();
  const theme = resolveEmailContentTheme(resolvedTheme);
  const shouldLoadImages = Boolean(settings?.settings?.externalImages);

  return useCallback(
    (id: string, enabled = true) =>
      queryOptions({
        // Keep the historic mail.get cache key so websocket invalidations and
        // every existing consumer continue to target the same thread detail.
        queryKey: trpc.mail.get.queryKey({ id }),
        queryFn: async ({ signal }) => {
          const fetchStartMs = performance.now();
          const result = await trpcClient.mail.openThread.query(
            { id, shouldLoadImages, theme },
            { signal },
          );
          const fetchEndMs = performance.now();

          for (const [messageId, processed] of Object.entries(result.rendered)) {
            queryClient.setQueryData(
              emailContentQueryKey(messageId, shouldLoadImages, theme),
              processed,
            );
          }

          // r16 : découpage du premier-ever cold (RTT / seed / getThread vs
          // sanitize serveur) — durées seules, lisibles dans ?bootperf=1.
          recordOpenThreadTimings({
            fetchStartMs,
            fetchEndMs,
            seedEndMs: performance.now(),
            server: result.timings,
          });
          // r16 : persist EXPLICITE des entrées lourdes fraîches (coalescé) —
          // un reload juste après lecture retrouve le corps dans l'IDB
          // owner-scopé au lieu de repayer un openThread réseau.
          requestImmediateDetailPersist();

          return result.thread;
        },
        enabled,
        staleTime: (query) => (hasCompleteThreadBodies(query.state.data) ? THREAD_STALE_MS : 0),
        // Websocket invalidations keep cached threads fresh. Refetching on every
        // mount duplicated openThread during navigation and flooded the user DO.
        // A projected/legacy cache entry without decoded bodies is the exception:
        // the active reader must repair it instead of showing an empty panel forever.
        refetchOnMount: (query) => enabled && !hasCompleteThreadBodies(query.state.data),
      }),
    [queryClient, shouldLoadImages, theme, trpc, trpcClient],
  );
}

export function usePrefetchThread() {
  const queryClient = useQueryClient();
  const openThreadQueryOptions = useOpenThreadQueryOptions();

  return useCallback(
    (id: string) => queryClient.prefetchQuery(openThreadQueryOptions(id)),
    [openThreadQueryOptions, queryClient],
  );
}

/**
 * Annulation EXACTE d'un openThread spéculatif en vol (r15b). La clé est celle
 * de usePrefetchThread (mail.get historique) et le queryFn propage déjà
 * l'AbortSignal jusqu'au fetch tRPC : cancelQueries aborte réellement la
 * requête côté client. Réservé aux vols du batch visible tracés par le
 * registre — le fil courant et les fetches du lecteur ne passent jamais ici.
 */
export function useCancelThreadPrefetch() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useCallback(
    (id: string) =>
      queryClient.cancelQueries({ queryKey: trpc.mail.get.queryKey({ id }), exact: true }),
    [queryClient, trpc],
  );
}

export const useThreads = () => {
  const { folder } = useParams<{ folder: string }>();
  const [searchValue] = useSearchValue();
  const [backgroundQueue] = useAtom(backgroundQueueAtom);
  const isInQueue = useAtomValue(isThreadInBackgroundQueueAtom);
  const trpc = useTRPC();
  const { labels } = useSearchLabels();
  // Gating session (P0 r6) : tant que l'identité n'est pas confirmée, la liste
  // ne DOIT ni requêter ni peindre — le shell neutre du QueryProvider est
  // mémoire-seule et aucune donnée mailbox ne doit y entrer (elle serait
  // servie par cookie avant confirmation de l'utilisateur).
  const { data: session } = useSession();

  // Opérateurs collaboratifs (is:shared / is:assigned / has:comment /
  // has:mention) : extraits AVANT le fournisseur (Gmail les ignorerait en
  // rendant zéro résultat), appliqués en aval contre les ensembles ACL de
  // teams.myCollabThreadSets. Le reste de la requête part inchangé.
  const collabSearch = useMemo(() => extractCollabFilters(searchValue.value), [searchValue.value]);
  const providerSearchValue = collabSearch.hasFilters
    ? collabSearch.providerQuery
    : searchValue.value;
  const collabSets = useCollabThreadSets(collabSearch.hasFilters);

  const isSearchingList = searchValue.value.trim().length > 0;
  const listThreadsQueryOptions = trpc.mail.listThreads.infiniteQueryOptions(
    {
      q: providerSearchValue,
      folder,
      labelIds: labels,
      // Pages de 50 sur le chemin projection (perf r6 : le scroll profond
      // sérialise les round-trips de pages). Recherche et Drafts gardent le
      // défaut serveur — voir mailListMaxResults.
      maxResults: mailListMaxResults(folder, isSearchingList),
    },
    {
      initialCursor: '',
      getNextPageParam: (lastPage) => lastPage?.nextPageToken ?? null,
      enabled: Boolean(session?.user?.id),
      // Snapshot d'abord, réconciliation stale-only en arrière-plan — contrat
      // partagé avec la chauffe des dossiers, prouvé par mail-list-query.test.ts.
      // Les websockets restent la voie chaude ; ceci couvre le dossier COURANT
      // resté ouvert au-delà du staleTime (audit r6).
      ...MAIL_LIST_QUERY_BEHAVIOR,
      // CUA 2026-07-30 (obs 3) : quand la clé change (recherche tapée, retour de
      // recherche, changement de labels), la vue précédente reste affichée pendant
      // que la nouvelle réponse arrive — plus d'écran-spinner bloquant de 2+ s. La
      // présentation lit isPlaceholderData pour le bandeau « recherche en cours ».
      placeholderData: (previousData, previousQuery) =>
        canReuseMailListPlaceholder(previousQuery?.queryKey, folder) ? previousData : undefined,
    },
  );
  const threadsQuery = useInfiniteQuery(listThreadsQueryOptions);

  // CUA 2026-07-30 (obs 3, « premier résultat <1 s ») : préview projection-first.
  // Pendant le vol de la recherche Gmail `q` (multi-secondes), la projection DO
  // (LIKE sujet/expéditeur, même scope dossier) répond vite ; ses lignes — des
  // correspondances réelles — remplacent la vue précédente tenue par
  // keepPreviousData. La réponse Gmail reste authoritative et reprend
  // l'affichage dès qu'elle atterrit (sélecteur ci-dessous). Une requête à
  // opérateurs reçoit une page vide du serveur → fallback comportement actuel.
  const isSearching = searchValue.value.trim().length > 0;
  const previewQuery = useQuery(
    trpc.mail.listThreads.queryOptions(
      { q: providerSearchValue, folder, labelIds: labels, cursor: '', localPreview: true },
      { enabled: isSearching && Boolean(session?.user?.id), staleTime: 60 * 1000 },
    ),
  );

  // Flatten threads from all pages and sort by receivedOn date (newest first)

  const freshThreads = useMemo(() => {
    return threadsQuery.data
      ? threadsQuery.data.pages
          .flatMap((e) => e.threads)
          .filter(Boolean)
          .filter((e) => !isInQueue(`thread:${e.id}`))
      : [];
  }, [threadsQuery.data, threadsQuery.dataUpdatedAt, isInQueue, backgroundQueue]);

  // Devlab (UX) : verrou perf forceSync (~40-45s de repeuplement DO mesuré,
  // wrangler tail 25/07/2026) — `mail.forceSync` purge puis repeuple de façon
  // asynchrone ; pendant la fenêtre, cette vue reçoit des pages vides. Tant que
  // le hold est armé (nav-user.tsx, déclenché à onMutate) ET que la réponse
  // fraîche est vide, on retombe sur l'instantané capturé pour CETTE vue exacte
  // (folder/recherche/labels) plutôt que de rendre une boîte vide.
  const forceSyncHold = useAtomValue(forceSyncHoldAtom);
  const observeForceSyncPurge = useSetAtom(observeForceSyncPurgeAtom);
  const deactivateForceSyncHold = useSetAtom(deactivateForceSyncHoldAtom);

  const forceSyncSnapshotItems = useMemo(() => {
    if (!forceSyncHold.active) return undefined;
    const currentHash = hashKey(listThreadsQueryOptions.queryKey);
    // Le cast porte sur un type erasé à la compilation (`typeof freshThreads`
    // n'est pas une lecture runtime de la valeur) : `freshThreads` n'a donc pas
    // sa place dans les dépendances de ce memo.
    return findForceSyncSnapshot(forceSyncHold.snapshots, currentHash) as
      | typeof freshThreads
      | undefined;
  }, [forceSyncHold, listThreadsQueryOptions.queryKey]);

  // Le serveur purge AVANT de repeupler, mais la purge n'atteint le client
  // qu'au fetch suivant : à l'instant du clic, le cache tient encore l'ancienne
  // liste non vide. `nextForceSyncHoldPhase` n'autorise le désarmement que sur
  // un non-vide qui SUIT un vide observé (repeuplement réel, pas un résidu
  // pré-purge) — voir le commentaire de la fonction dans force-sync-hold-selector.ts.
  useEffect(() => {
    const phase = nextForceSyncHoldPhase({
      active: forceSyncHold.active,
      purgeObserved: forceSyncHold.purgeObserved,
      freshItemsLength: freshThreads.length,
    });
    if (phase === 'observe-purge') observeForceSyncPurge();
    else if (phase === 'deactivate') deactivateForceSyncHold();
  }, [
    forceSyncHold.active,
    forceSyncHold.purgeObserved,
    freshThreads.length,
    observeForceSyncPurge,
    deactivateForceSyncHold,
  ]);

  const previewThreads = useMemo(() => {
    const rows = previewQuery.data?.threads;
    if (!rows) return undefined;
    return rows.filter(Boolean).filter((e) => !isInQueue(`thread:${e.id}`));
  }, [previewQuery.data, isInQueue, backgroundQueue]);

  const literalPreviewThreads = useMemo(() => {
    if (!isSearching || !isSimpleLiteralSearch(providerSearchValue)) return previewThreads;
    if (previewThreads?.length) return previewThreads;
    // During placeholderData, `freshThreads` is the rich page from the same
    // folder before q changed. Filter it synchronously so a known DHL-style
    // match paints in the first frame instead of waiting on a DO round-trip.
    if (threadsQuery.isPlaceholderData) {
      return filterLiteralSearchPreviewItems(freshThreads, providerSearchValue);
    }
    return previewThreads;
  }, [
    freshThreads,
    isSearching,
    previewThreads,
    providerSearchValue,
    threadsQuery.isPlaceholderData,
  ]);

  const threads = useMemo(() => {
    const held = selectForceSyncHoldItems({
      active: forceSyncHold.active,
      freshItems: freshThreads,
      snapshotItems: forceSyncSnapshotItems,
    });
    // Hold forceSync prioritaire : pendant la fenêtre de resynchro, on tient le
    // snapshot de la vue — pas de substitution préview par-dessus.
    if (forceSyncHold.active) return held;
    if (!isSearching) return held;
    if (threadsQuery.isPlaceholderData) {
      return selectSearchPreviewItems({
        isSearching,
        authoritativeIsPlaceholder: true,
        previewItems: literalPreviewThreads,
        fallbackItems: held,
        // Littéral (« DHL ») : seuls les matches locaux s'affichent pendant le
        // vol Gmail — jamais la vue précédente (voir search-preview-selector).
        literalSearch: isSimpleLiteralSearch(providerSearchValue),
      });
    }
    // Réponse Gmail atterrie. Littéral : fusion locale-d'abord — les matches
    // exacts de la projection restent en tête (une page Gmail vide ou
    // divergente ne les efface jamais), Gmail enrichit les lignes qu'il
    // confirme et complète avec ses matches hors projection, dédupliqués par
    // threadId (CUA 2026-07-31 : Kura/Restaurant vides, LIQUID STUDIO faux
    // positif). Non-littéral (opérateurs/IA) : composition Gmail inchangée,
    // la préview n'y est qu'un sentinel d'enrichissement.
    if (isSimpleLiteralSearch(providerSearchValue)) {
      return mergeAuthoritativeWithLocalMatches(held, previewThreads);
    }
    return enrichThinItemsWithPreview(held, previewThreads);
  }, [
    forceSyncHold.active,
    freshThreads,
    forceSyncSnapshotItems,
    isSearching,
    searchValue.value,
    threadsQuery.isPlaceholderData,
    previewThreads,
    literalPreviewThreads,
  ]);

  // Application des opérateurs collaboratifs : intersection avec les sets
  // ACL-filtrés. Sets en vol → liste vide plutôt qu'un flash non filtré.
  const visibleThreads = useMemo(() => {
    if (!collabSearch.hasFilters) return threads;
    if (!collabSets.data) return [];
    return filterThreadsByCollabSets(threads, collabSearch.filters, collabSets.data);
  }, [threads, collabSearch, collabSets.data]);

  const isEmpty = useMemo(() => visibleThreads.length === 0, [visibleThreads]);
  const isReachingEnd =
    isEmpty ||
    (threadsQuery.data &&
      !threadsQuery.data.pages[threadsQuery.data.pages.length - 1]?.nextPageToken);

  const loadMore = async () => {
    if (threadsQuery.isLoading || threadsQuery.isFetching) return;
    await threadsQuery.fetchNextPage();
  };

  // 5th element: whether a forceSync hold is currently armed for this view — the
  // presentation layer (mail-list.tsx, via useMailListData) uses this to show the
  // "resync in progress" banner, independently of whether a snapshot is currently
  // substituted (it may not be, on a view with nothing cached yet).
  return [threadsQuery, visibleThreads, isReachingEnd, loadMore, forceSyncHold.active] as const;
};

export const useThread = (threadId: string | null, options?: { enabled?: boolean }) => {
  const { data: session } = useSession();
  const [_threadId] = useQueryState('threadId');
  const id = threadId ? threadId : _threadId;
  const openThreadQueryOptions = useOpenThreadQueryOptions();
  const queryClient = useQueryClient();
  const prefetch = useCallback(
    () => (id ? queryClient.prefetchQuery(openThreadQueryOptions(id)) : Promise.resolve()),
    [id, openThreadQueryOptions, queryClient],
  );

  // #30: list rows served from the rich projection pass { enabled: false } so opening the
  // inbox triggers NO per-row mail.get (and no processEmailContent). The body is fetched
  // only for the active thread and for thin paths (search) that lack the projection.
  const threadQuery = useQuery(
    openThreadQueryOptions(
      id ?? '',
      (options?.enabled ?? true) && Boolean(id) && Boolean(session?.user?.id),
    ),
  );

  const { latestDraft, isGroupThread, finalData } = useMemo(() => {
    if (!threadQuery.data) {
      return {
        latestDraft: undefined,
        isGroupThread: false,
        finalData: undefined,
      };
    }

    const latestDraft = threadQuery.data.latest?.id
      ? threadQuery.data.messages.findLast((e) => e.isDraft)
      : undefined;

    const isGroupThread = threadQuery.data.latest?.id
      ? (() => {
          const totalRecipients = [
            ...(threadQuery.data.latest.to || []),
            ...(threadQuery.data.latest.cc || []),
            ...(threadQuery.data.latest.bcc || []),
          ].length;
          return totalRecipients > 1;
        })()
      : false;

    const nonDraftMessages = threadQuery.data.messages.filter((e) => !e.isDraft);
    const finalData: IGetThreadResponse = {
      ...threadQuery.data,
      messages: nonDraftMessages,
    };

    return { latestDraft, isGroupThread, finalData };
  }, [threadQuery.data]);

  return {
    ...threadQuery,
    data: finalData,
    isGroupThread,
    latestDraft,
    prefetch,
  };
};
