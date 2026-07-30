import { useIsFetching } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { useThreads } from '@/hooks/use-threads';

/**
 * Element type of the flattened thread list. Derived from `useThreads()` so the
 * list payload shape stays identical — the rich server projection (#30) reshapes
 * this at the source, not here.
 */
export type MailListItem = ReturnType<typeof useThreads>[1][number];

/**
 * The UNIQUE list-consumption contract. Presentation (`MailList`) reads the thread
 * list exclusively through this interface — it is the single seam where the server
 * projection (#30, W2-A) reshapes the data and where the network/error states
 * (#34, W2-B) are surfaced. Do not let the presentation reach into `useThreads()`
 * or react-query directly; extend this object instead.
 */
export interface MailListData {
  /** Flattened, background-queue-filtered thread refs (the list payload). */
  items: MailListItem[];
  /** First load in flight, no data yet. */
  isLoading: boolean;
  /** Any list fetch in flight (foreground or background revalidation). */
  isFetching: boolean;
  /**
   * The rows on screen belong to the PREVIOUS view (placeholderData) while the new
   * key (search/folder/labels change) is still fetching — CUA 2026-07-30 (obs 3):
   * presentation shows a non-blocking notice instead of a full spinner.
   */
  isTransitionPending: boolean;
  /** Next-page fetch in flight. */
  isFetchingNextPage: boolean;
  /** At least one individual thread body (`mail.get`) fetch in flight. */
  isFetchingThreadBodies: boolean;
  /** List query resolved to an error — seam for #34 error states. */
  isError: boolean;
  /** The list query error, if any — seam for #34. */
  error: unknown;
  /** Cached list is stale per react-query `staleTime` — seam for #34. */
  isStale: boolean;
  /** Another page is available. */
  hasNextPage: boolean;
  /** No further pages / empty list. */
  isReachingEnd: boolean | undefined;
  /** Fetch the next page (no-op while already loading/fetching). */
  loadMore: () => Promise<void>;
  /** Force a list refetch. */
  refetch: () => Promise<unknown>;
  /**
   * A `mail.forceSync` hold is armed for this view (issue: forceSync purges then
   * asynchronously repopulates over ~40-45s — see `store/force-sync-hold.ts`).
   * `items` may already be the held snapshot; this flag is for the "resync in
   * progress" banner, which should show for the whole hold window regardless.
   */
  isForceSyncHold: boolean;
}

/**
 * Data-layer hook: wraps the `useThreads()` primitive and exposes the single typed
 * consumption interface {@link MailListData}. Behaviour is identical to consuming
 * `useThreads()` + `useIsFetching(mail.get)` directly; this only centralises the
 * seam so #30/#34 have one place to plug in.
 */
export function useMailListData(): MailListData {
  const [threadsQuery, items, isReachingEnd, loadMore, isForceSyncHold] = useThreads();
  const trpc = useTRPC();
  const isFetchingThreadBodies = useIsFetching({ queryKey: trpc.mail.get.queryKey() }) > 0;

  return {
    items,
    isLoading: threadsQuery.isLoading,
    isFetching: threadsQuery.isFetching,
    isTransitionPending: threadsQuery.isPlaceholderData && threadsQuery.isFetching,
    isFetchingNextPage: threadsQuery.isFetchingNextPage,
    isFetchingThreadBodies,
    isError: threadsQuery.isError,
    error: threadsQuery.error,
    isStale: threadsQuery.isStale,
    hasNextPage: threadsQuery.hasNextPage,
    isReachingEnd,
    loadMore,
    refetch: threadsQuery.refetch,
    isForceSyncHold,
  };
}
