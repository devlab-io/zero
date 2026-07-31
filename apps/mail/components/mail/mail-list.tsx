import {
  planVisibleThreadPrefetch,
  prefetchThreadIdsInBatches,
  selectNextThreadIds,
  shouldPrefetchThreadBodies,
  useInitialThreadPrefetch,
} from '@/hooks/use-thread-prefetch';
import {
  pendingFolderNavigationAtom,
  shouldMaskPendingMailFolder,
} from '@/store/folder-navigation';
import { useMailSelection, type MailSelectionModifiers } from '@/hooks/use-mail-selection';
import { focusedIndexAtom, useMailNavigation } from '@/hooks/use-mail-navigation';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { shouldLoadNextMailPage } from '@/lib/mail-pagination';
import { useMailListData } from '@/hooks/use-mail-list-data';
import { selectMailListState } from '@/lib/mail-list-state';
import { useSearchValue } from '@/hooks/use-search-value';
import { EmptyStateIcon } from '../icons/empty-state-svg';
import { useIsOffline } from '@/hooks/use-online-status';
import { usePrefetchThread } from '@/hooks/use-threads';
import { useSettings } from '@/hooks/use-settings';
import { VList, type VListHandle } from 'virtua';
import { markStage } from '@/lib/perf-stages';
import type { ParsedMessage } from '@/types';
import { Thread } from './mail-list-thread';
import { Draft } from './mail-list-draft';
import { RefreshCcw } from 'lucide-react';
import { cn, FOLDERS } from '@/lib/utils';
import { m } from '@/paraglide/messages';
import { useParams } from 'react-router';
import { useQueryState } from 'nuqs';
import { useAtom } from 'jotai';

// The list presentation consumes the thread list exclusively through the
// `useMailListData()` contract and the `useMailSelection()` layer; the row
// presentation lives in ./mail-list-thread and ./mail-list-draft.
export { MailLabels } from './mail-list-labels';

export const MailList = memo(
  function MailList() {
    const { folder } = useParams<{ folder: string }>();
    const { data: settingsData } = useSettings();
    const [, setThreadId] = useQueryState('threadId');
    const [, setDraftId] = useQueryState('draftId');
    const [searchValue, setSearchValue] = useSearchValue();

    const {
      items,
      isLoading,
      isRestoring,
      isFetching,
      isTransitionPending,
      isFetchingNextPage,
      isError,
      hasNextPage,
      loadMore,
      refetch,
      isForceSyncHold,
    } = useMailListData();

    const isOffline = useIsOffline();
    const prefetchThread = usePrefetchThread();

    const itemsRef = useRef(items);
    const parentRef = useRef<HTMLDivElement>(null);
    const vListRef = useRef<VListHandle>(null);
    const visiblePrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const visiblePrefetchGenerationRef = useRef(0);
    const listPageBusyRef = useRef(isLoading || isRestoring || isFetchingNextPage);
    const lastVisiblePrefetchKeyRef = useRef('');

    useEffect(() => {
      itemsRef.current = items;
    }, [items]);

    // Add event listener for refresh
    useEffect(() => {
      const handleRefresh = () => {
        void refetch();
      };

      window.addEventListener('refreshMailList', handleRefresh);
      return () => window.removeEventListener('refreshMailList', handleRefresh);
    }, [refetch]);

    const handleNavigateToThread = useCallback(
      (threadId: string | null) => {
        setThreadId(threadId);
        return;
      },
      [setThreadId],
    );

    const { focusedIndex, handleMouseEnter, keyboardActive } = useMailNavigation({
      items,
      containerRef: parentRef,
      onNavigate: handleNavigateToThread,
    });

    const { getSelectMode, handleSelectMail, setAnchorIndex } = useMailSelection(itemsRef);

    const [, setFocusedIndex] = useAtom(focusedIndexAtom);
    const [pendingFolder, setPendingFolder] = useAtom(pendingFolderNavigationAtom);

    const { optimisticMarkAsRead } = useOptimisticActions();
    const handleMailClick = useCallback(
      (message: ParsedMessage, modifiers?: MailSelectionModifiers) => {
        const mode = getSelectMode(modifiers);
        const autoRead = settingsData?.settings?.autoRead ?? true;

        if (mode !== 'single') {
          const messageThreadId = message.threadId ?? message.id;
          const clickedIndex = itemsRef.current.findIndex((item) => item.id === messageThreadId);
          if (clickedIndex !== -1 && mode !== 'range') {
            setAnchorIndex(clickedIndex);
          }
          return handleSelectMail(message, mode);
        }

        handleMouseEnter(message.id);

        const messageThreadId = message.threadId ?? message.id;
        const clickedIndex = itemsRef.current.findIndex((item) => item.id === messageThreadId);
        // Warm exactly the current thread and the next two before navigation.
        // React Query deduplicates the current-row pointer prefetch. Starting the
        // adjacent requests here makes ArrowDown instant even when the reader is
        // opened and advanced before its post-render effect gets a turn.
        const adjacentThreadIds = selectNextThreadIds(
          itemsRef.current.map((item) => item.id),
          messageThreadId,
          clickedIndex,
        );
        void Promise.all(
          [messageThreadId, ...adjacentThreadIds].map((id) =>
            prefetchThread(id).catch(() => undefined),
          ),
        );
        setFocusedIndex(clickedIndex);
        if (message.unread && autoRead) optimisticMarkAsRead([messageThreadId], true);
        markStage('thread:open');
        setThreadId(messageThreadId);
        setDraftId(null);
        // Don't clear activeReplyId - let ThreadDisplay handle Reply All auto-opening
      },
      [
        getSelectMode,
        handleSelectMail,
        setAnchorIndex,
        handleMouseEnter,
        setFocusedIndex,
        optimisticMarkAsRead,
        setThreadId,
        setDraftId,
        prefetchThread,
        settingsData,
      ],
    );

    const isFiltering = searchValue.value.trim().length > 0;
    // Recherche : le préchauffage attend que les résultats soient POSÉS (plus
    // de vol authoritative ni de transition) puis réchauffe les trois premières
    // lignes — celles que l'utilisateur ouvre — pour une ouverture au cache
    // (CUA 2026-07-31 : Linear 1108 ms à chaud depuis les résultats). Pendant
    // le vol, aucune spéculation : la pagination et la préview gardent le DO.
    const isSearchSettled = isFiltering && !isTransitionPending && !isFetching;
    useInitialThreadPrefetch(
      items,
      folder !== FOLDERS.DRAFT && !isLoading && !isRestoring && (!isFiltering || isSearchSettled),
    );

    useEffect(() => {
      if (isSearchSettled) markStage('search:results-settled');
    }, [isSearchSettled]);

    useEffect(() => {
      if (isFiltering && !isLoading) {
        setSearchValue((current) => ({
          ...current,
          isLoading: false,
        }));
      }
    }, [isLoading, isFiltering, setSearchValue]);

    const clearFilters = () => {
      setSearchValue({
        value: '',
        highlight: '',
        folder: '',
      });
    };

    const filteredItems = useMemo(() => items.filter((item) => item.id), [items]);
    const isFolderTransitionMasked = shouldMaskPendingMailFolder(pendingFolder, folder);

    useEffect(() => {
      const isListPageBusy = isLoading || isRestoring || isFetchingNextPage;
      listPageBusyRef.current = isListPageBusy;
      if (!isListPageBusy) return;

      // The lightweight list always wins over speculative bodies. Invalidate
      // the current generation so an already-running queue stops after its
      // current two-request batch instead of delaying the next list page.
      visiblePrefetchGenerationRef.current += 1;
      if (visiblePrefetchTimerRef.current !== null) {
        clearTimeout(visiblePrefetchTimerRef.current);
        visiblePrefetchTimerRef.current = null;
      }
    }, [isFetchingNextPage, isLoading, isRestoring]);

    const prefetchVisibleThreads = useCallback(
      async (generation: number) => {
        const list = vListRef.current;
        const connection = (
          navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
        ).connection;
        if (
          !list ||
          folder === FOLDERS.DRAFT ||
          listPageBusyRef.current ||
          isFiltering ||
          !shouldPrefetchThreadBodies(connection)
        ) {
          return;
        }

        const plan = planVisibleThreadPrefetch(
          filteredItems.map((item) => item.id),
          list.findStartIndex(),
          list.findEndIndex(),
          lastVisiblePrefetchKeyRef.current,
        );
        if (plan.skip) return;

        // Keep at most two body reads in flight. Production showed that warming
        // an entire tall viewport at once could monopolise the mailbox Durable
        // Object and make list pagination feel frozen. A newer scroll generation
        // or an active page fetch cancels the remaining speculative batches.
        const completed = await prefetchThreadIdsInBatches(
          plan.ids,
          (id) => prefetchThread(id).catch(() => undefined),
          () => generation === visiblePrefetchGenerationRef.current && !listPageBusyRef.current,
        );

        if (completed) {
          lastVisiblePrefetchKeyRef.current = plan.key;
        }
      },
      [filteredItems, folder, isFiltering, prefetchThread],
    );

    const scheduleVisibleThreadPrefetch = useCallback(() => {
      const generation = visiblePrefetchGenerationRef.current + 1;
      visiblePrefetchGenerationRef.current = generation;
      if (visiblePrefetchTimerRef.current !== null) {
        clearTimeout(visiblePrefetchTimerRef.current);
      }

      // Wait only long enough to collapse a stream of scroll events. Starting
      // a bounded queue for the final viewport avoids warming every row raced
      // past by a fast scroll while still getting displayed bodies into cache.
      visiblePrefetchTimerRef.current = setTimeout(() => {
        visiblePrefetchTimerRef.current = null;
        void prefetchVisibleThreads(generation);
      }, 40);
    }, [prefetchVisibleThreads]);

    // Parité r3 (CUA : 5 pages de scroll profond = 1 246 ms chez Shortwave) :
    // une page qui atterrit ne génère PAS d'événement scroll. Sans ce
    // re-contrôle, un viewport haut (première page entièrement visible) ou un
    // arrêt pile à la frontière laissait la page suivante ET le réchauffage
    // des corps attendre le prochain geste. Chaîne loadMore tant que la
    // réserve est sous le seuil (borné : il s'arrête à une page pleine de
    // réserve), sinon réarme le warmer pour les lignes fraîchement révélées.
    const loadMoreRef = useRef(loadMore);
    loadMoreRef.current = loadMore;
    useEffect(() => {
      if (isLoading || isRestoring || isFetchingNextPage) return;
      const list = vListRef.current;
      if (!list) return;
      const remainingItems = Math.max(0, filteredItems.length - 1 - list.findEndIndex());
      if (shouldLoadNextMailPage({ remainingItems, isLoading, isFetchingNextPage, hasNextPage })) {
        void loadMoreRef.current();
        return;
      }
      scheduleVisibleThreadPrefetch();
    }, [
      filteredItems.length,
      hasNextPage,
      isFetchingNextPage,
      isLoading,
      isRestoring,
      scheduleVisibleThreadPrefetch,
    ]);

    useEffect(() => {
      lastVisiblePrefetchKeyRef.current = '';
      visiblePrefetchGenerationRef.current += 1;
      return () => {
        if (visiblePrefetchTimerRef.current !== null) {
          clearTimeout(visiblePrefetchTimerRef.current);
          visiblePrefetchTimerRef.current = null;
        }
      };
    }, [folder, searchValue.value]);

    useEffect(() => {
      if (pendingFolder === folder) setPendingFolder(null);
    }, [folder, pendingFolder, setPendingFolder]);

    // Honest network/state selection (issue #34): a failed read never renders as
    // "empty" and cached rows survive a failed refresh.
    const viewState = selectMailListState({
      itemCount: isFolderTransitionMasked ? 0 : items.length,
      isLoading: isLoading || isFolderTransitionMasked,
      isRestoring,
      isTransitionPending,
      isFetching,
      isError,
      isOffline,
    });

    const Comp = useMemo(() => (folder === FOLDERS.DRAFT ? Draft : Thread), [folder]);

    const vListRenderer = useCallback(
      (index: number) => {
        const item = filteredItems[index];
        return item ? (
          <>
            <Comp
              key={item.id}
              message={item}
              isKeyboardFocused={focusedIndex === index && keyboardActive}
              index={index}
              onClick={handleMailClick}
            />
            {index === filteredItems.length - 1 && isFetchingNextPage ? (
              <div className="flex w-full justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
              </div>
            ) : null}
          </>
        ) : (
          <></>
        );
      },
      [filteredItems, focusedIndex, keyboardActive, isFetchingNextPage, handleMailClick, Comp],
    );

    return (
      <>
        <div
          ref={parentRef}
          className={cn(
            'hide-link-indicator flex h-full w-full',
            getSelectMode() === 'range' && 'select-none',
          )}
        >
          <>
            {viewState === 'loading' ? (
              <div className="flex h-32 w-full items-center justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
              </div>
            ) : viewState === 'error' ? (
              <div className="flex w-full items-center justify-center p-6">
                <div className="flex max-w-md flex-col items-center justify-center gap-3 text-center">
                  <EmptyStateIcon width={160} height={160} />
                  <div>
                    <p className="text-lg">{m['states.mailList.errorTitle']()}</p>
                    <p className="text-md text-muted-foreground dark:text-white/50">
                      {isOffline
                        ? m['states.mailList.offlineNotice']()
                        : m['states.mailList.errorDescription']()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-[#313131]"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    {m['states.retry']()}
                  </button>
                </div>
              </div>
            ) : viewState === 'empty' ? (
              <div className="flex w-full items-center justify-center">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <EmptyStateIcon width={200} height={200} />
                  <div className="mt-5">
                    <p className="text-lg">{m['states.mailList.emptyTitle']()}</p>
                    <p className="text-md text-muted-foreground dark:text-white/50">
                      {m['states.mailList.emptyDescription']()}{' '}
                      <button
                        type="button"
                        className="cursor-pointer underline"
                        onClick={clearFilters}
                      >
                        {m['states.mailList.clearFilters']()}
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col" id="mail-list-scroll">
                {isForceSyncHold ? (
                  // Devlab (UX) : verrou perf forceSync (~40-45s de repeuplement DO
                  // mesuré, wrangler tail 25/07/2026) — bandeau discret pendant le
                  // hold, tant que la resynchro n'a pas repeuplé cette vue.
                  <div className="flex items-center gap-2 border-b border-blue-200/60 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                    <RefreshCcw className="h-3 w-3 animate-spin" />
                    <span>{m['states.mailList.forceSyncNotice']()}</span>
                  </div>
                ) : isTransitionPending && isFiltering ? (
                  // CUA 2026-07-30 (obs 3) : recherche en vol — les lignes affichées
                  // sont la préview projection (correspondances sujet/expéditeur
                  // servies par le DO) ou, à défaut, la vue précédente
                  // (placeholderData) ; la réponse authoritative (Gmail `q`,
                  // ~2 s mesurées) arrive en fond. Bandeau non bloquant, même
                  // style que le hold forceSync.
                  <div className="flex items-center gap-2 border-b border-blue-200/60 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                    <RefreshCcw className="h-3 w-3 animate-spin" />
                    <span>{m['states.mailList.searchingNotice']()}</span>
                  </div>
                ) : viewState === 'stale' ? (
                  <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    <span>
                      {isOffline
                        ? m['states.mailList.offlineNotice']()
                        : m['states.mailList.staleNotice']()}
                    </span>
                    <button
                      type="button"
                      onClick={() => void refetch()}
                      className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20"
                    >
                      <RefreshCcw className="h-3 w-3" />
                      {m['states.retry']()}
                    </button>
                  </div>
                ) : null}
                <VList
                  ref={vListRef}
                  count={filteredItems.length}
                  overscan={5}
                  itemSize={100}
                  className="scrollbar-none flex-1 overflow-x-hidden"
                  onScroll={() => {
                    if (!vListRef.current) return;
                    const endIndex = vListRef.current.findEndIndex();
                    const shouldLoadNextPage = shouldLoadNextMailPage({
                      // Start the next lightweight list page early enough that
                      // a fast scroll never reaches an unloaded boundary.
                      remainingItems: Math.abs(filteredItems.length - 1 - endIndex),
                      isLoading,
                      isFetchingNextPage,
                      hasNextPage,
                    });
                    if (shouldLoadNextPage) {
                      visiblePrefetchGenerationRef.current += 1;
                      if (visiblePrefetchTimerRef.current !== null) {
                        clearTimeout(visiblePrefetchTimerRef.current);
                        visiblePrefetchTimerRef.current = null;
                      }
                      void loadMore();
                      return;
                    }

                    scheduleVisibleThreadPrefetch();
                  }}
                >
                  {vListRenderer}
                </VList>
              </div>
            )}
          </>
        </div>
        <div className="w-full pt-2 text-center">
          {isFetching ? (
            <div className="text-center">
              <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
            </div>
          ) : (
            <div className="h-2" />
          )}
        </div>
      </>
    );
  },
  () => true,
);
