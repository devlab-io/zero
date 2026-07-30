interface MailPaginationState {
  remainingItems: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

/**
 * Page-list readiness only. Thread-body prefetches are intentionally absent:
 * reading or warming adjacent messages must never block infinite scrolling.
 */
export function shouldLoadNextMailPage({
  remainingItems,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
}: MailPaginationState) {
  return remainingItems < 15 && !isLoading && !isFetchingNextPage && hasNextPage;
}
