import { focusedIndexAtom, useMailNavigation } from '@/hooks/use-mail-navigation';
import useSearchLabels, { hasActiveMailFilters } from '@/hooks/use-labels-search';
import { useCommandPalette } from '@/components/context/command-palette-context';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { resolveMailListNavigation } from './mail-list-navigation';
import { useMailSelection } from '@/hooks/use-mail-selection';
import { useMailListData } from '@/hooks/use-mail-list-data';
import { selectMailListState } from '@/lib/mail-list-state';
import { useSearchValue } from '@/hooks/use-search-value';
import { EmptyStateIcon } from '../icons/empty-state-svg';
import { useIsOffline } from '@/hooks/use-online-status';
import { useSettings } from '@/hooks/use-settings';
import { MailListSkeleton } from './mail-skeleton';
import { VList, type VListHandle } from 'virtua';
import type { ParsedMessage } from '@/types';
import { Thread } from './mail-list-thread';
import { Draft } from './mail-list-draft';
import { RefreshCcw } from 'lucide-react';
import { cn, FOLDERS } from '@/lib/utils';
import { m } from '@/paraglide/messages';
import { useParams } from 'react-router';
import { Button } from '../ui/button';
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
    const [, setComposeOpen] = useQueryState('isComposeOpen');
    const [searchValue, setSearchValue] = useSearchValue();
    const { activeFilters, clearAllFilters } = useCommandPalette();
    const { labels } = useSearchLabels();
    const [category] = useQueryState('category');

    const {
      items,
      isLoading,
      isFetching,
      isFetchingNextPage,
      isFetchingThreadBodies,
      isError,
      hasNextPage,
      loadMore,
      refetch,
    } = useMailListData();

    const isOffline = useIsOffline();

    const itemsRef = useRef(items);
    const parentRef = useRef<HTMLDivElement>(null);
    const vListRef = useRef<VListHandle>(null);

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

    const isDraftFolder = folder === FOLDERS.DRAFT;
    const autoRead = settingsData?.settings?.autoRead ?? true;

    const handleNavigateToThread = useCallback(
      (targetId: string | null) => {
        const navigation = resolveMailListNavigation(folder, targetId);
        setThreadId(navigation.threadId);
        setDraftId(navigation.draftId);
        if (navigation.composeOpen !== undefined) setComposeOpen(navigation.composeOpen);
      },
      [folder, setComposeOpen, setDraftId, setThreadId],
    );

    const { focusedIndex, handleMouseEnter, keyboardActive } = useMailNavigation({
      items,
      containerRef: parentRef,
      onNavigate: handleNavigateToThread,
      openOnFocus: !isDraftFolder,
      autoMarkAsRead: !isDraftFolder && autoRead,
    });

    const { getSelectMode, handleSelectMail, setAnchorIndex } = useMailSelection(itemsRef);

    const [, setActiveReplyId] = useQueryState('activeReplyId');
    const [, setFocusedIndex] = useAtom(focusedIndexAtom);

    const { optimisticMarkAsRead } = useOptimisticActions();
    const handleMailClick = useCallback(
      (message: ParsedMessage) => async () => {
        const mode = getSelectMode();

        if (mode !== 'single') {
          const messageThreadId = message.threadId ?? message.id;
          const clickedIndex = itemsRef.current.findIndex((item) => item.id === messageThreadId);
          if (clickedIndex !== -1 && mode !== 'range') {
            setAnchorIndex(clickedIndex);
          }
          return handleSelectMail(message);
        }

        handleMouseEnter(message.id);

        const messageThreadId = message.threadId ?? message.id;
        const clickedIndex = itemsRef.current.findIndex((item) => item.id === messageThreadId);
        setFocusedIndex(clickedIndex);
        if (message.unread && autoRead) optimisticMarkAsRead([messageThreadId], true);
        setThreadId(messageThreadId);
        setDraftId(null);
        // Don't clear activeReplyId - let ThreadDisplay handle Reply All auto-opening
      },
      [
        getSelectMode,
        handleSelectMail,
        handleMouseEnter,
        setFocusedIndex,
        optimisticMarkAsRead,
        setThreadId,
        setDraftId,
        autoRead,
        setActiveReplyId,
      ],
    );

    const isFiltering = hasActiveMailFilters({
      searchText: searchValue.value,
      labels,
      category,
      activeFilterCount: activeFilters.length,
    });

    useEffect(() => {
      if (isFiltering && !isLoading) {
        setSearchValue({
          ...searchValue,
          isLoading: false,
        });
      }
    }, [isLoading, isFiltering, setSearchValue]);

    const clearFilters = () => {
      clearAllFilters();
    };

    const filteredItems = useMemo(() => items.filter((item) => item.id), [items]);

    // Honest network/state selection (issue #34): a failed read never renders as
    // "empty" and cached rows survive a failed refresh.
    const viewState = selectMailListState({
      itemCount: items.length,
      isLoading,
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
            {index === filteredItems.length - 1 &&
            (isFetchingNextPage || isFetchingThreadBodies) ? (
              <div className="flex w-full justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent motion-reduce:animate-none dark:border-white dark:border-t-transparent" />
              </div>
            ) : null}
          </>
        ) : (
          <></>
        );
      },
      [
        folder,
        filteredItems,
        focusedIndex,
        keyboardActive,
        isFetchingThreadBodies,
        isFetchingNextPage,
        handleMailClick,
        isLoading,
        isFetching,
        hasNextPage,
      ],
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
              <MailListSkeleton />
            ) : viewState === 'error' ? (
              <div role="alert" className="flex w-full items-center justify-center p-6">
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
                  <Button
                    variant="outline"
                    onClick={() => void refetch()}
                    className="min-h-11 md:min-h-10"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    {m['states.retry']()}
                  </Button>
                </div>
              </div>
            ) : viewState === 'empty' ? (
              <div className="flex w-full items-center justify-center">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <EmptyStateIcon width={200} height={200} />
                  <div className="mt-5">
                    <p className="text-lg">
                      {isFiltering
                        ? m['states.mailList.filteredEmptyTitle']()
                        : m['states.mailList.emptyTitle']()}
                    </p>
                    <p className="text-md text-muted-foreground dark:text-white/50">
                      {isFiltering ? (
                        <>
                          {m['states.mailList.filteredEmptyDescription']()}{' '}
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto min-h-11 px-1 align-baseline md:min-h-10"
                            onClick={clearFilters}
                          >
                            {m['states.mailList.clearFilters']()}
                          </Button>
                        </>
                      ) : (
                        m['states.mailList.emptyDescription']()
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col" id="mail-list-scroll">
                {viewState === 'stale' ? (
                  <div
                    role="status"
                    className="flex items-center justify-between gap-2 border-b border-amber-200/60 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                  >
                    <span>
                      {isOffline
                        ? m['states.mailList.offlineNotice']()
                        : m['states.mailList.staleNotice']()}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void refetch()}
                      className="min-h-11 shrink-0 px-2 font-medium hover:bg-amber-100 md:min-h-10 dark:hover:bg-amber-500/20"
                    >
                      <RefreshCcw className="h-3 w-3" />
                      {m['states.retry']()}
                    </Button>
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
                    if (
                      // if the shown items are last 5 items, load more
                      Math.abs(filteredItems.length - 1 - endIndex) < 7 &&
                      !isLoading &&
                      !isFetchingNextPage &&
                      !isFetchingThreadBodies &&
                      hasNextPage
                    ) {
                      void loadMore();
                    }
                  }}
                >
                  {vListRenderer}
                </VList>
              </div>
            )}
          </>
        </div>
        <div className="flex h-8 w-full items-center justify-center text-center">
          {isFetching ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent motion-reduce:animate-none dark:border-white dark:border-t-transparent" />
          ) : null}
        </div>
      </>
    );
  },
  () => true,
);
