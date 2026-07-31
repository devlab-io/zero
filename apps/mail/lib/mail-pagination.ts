interface MailPaginationState {
  remainingItems: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

/**
 * Page-list readiness only. Thread-body prefetches are intentionally absent:
 * reading or warming adjacent messages must never block infinite scrolling.
 * The threshold is one full server page (20 rows) so a fast flick never
 * reaches an unloaded boundary; chained re-checks after each append stop as
 * soon as a full page of reserve exists, which bounds memory.
 */
export function shouldLoadNextMailPage({
  remainingItems,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
}: MailPaginationState) {
  return remainingItems < 20 && !isLoading && !isFetchingNextPage && hasNextPage;
}

interface ReaderPaginationState {
  index: number;
  itemCount: number;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

/** Rows left below the open thread before ArrowDown/j hits the loaded boundary. */
const READER_EXTEND_THRESHOLD = 5;

/**
 * The reader must extend the list itself: while a thread is open the list does
 * not scroll, so the scroll-driven pagination never fires and ArrowDown/j used
 * to hit a wall near the end of the loaded pages. Extending early also gives
 * the adjacent-thread prefetch real targets deep in the inbox.
 */
export function shouldExtendReaderPages({
  index,
  itemCount,
  isFetchingNextPage,
  hasNextPage,
}: ReaderPaginationState) {
  return (
    index >= 0 &&
    itemCount > 0 &&
    itemCount - 1 - index <= READER_EXTEND_THRESHOLD &&
    !isFetchingNextPage &&
    hasNextPage
  );
}
