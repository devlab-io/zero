export const THREAD_BODY_PREFETCH_COUNT = 50;

/** Preserve list order, remove duplicate rows, and cap the persistent body warmer. */
export function getThreadPrefetchIds(
  items: ReadonlyArray<{ id: string }>,
  limit = THREAD_BODY_PREFETCH_COUNT,
): string[] {
  return [...new Set(items.map((item) => item.id))].slice(0, Math.max(0, limit));
}
