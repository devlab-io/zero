import { usePrefetchThread } from '@/hooks/use-threads';
import { useEffect, useMemo } from 'react';

const PREFETCH_COUNT = 2;
const INITIAL_PREFETCH_COUNT = 3;
const VISIBLE_PREFETCH_AHEAD_COUNT = 2;
const VISIBLE_PREFETCH_BATCH_SIZE = 2;

export type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

export function shouldPrefetchThreadBodies(connection?: NetworkInformation): boolean {
  if (connection?.saveData) return false;
  return !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}

export function selectNextThreadIds(
  ids: readonly string[],
  currentId: string | null,
  currentIndexHint: number | null = null,
): string[] {
  if (!currentId) return [];
  const matchingIndex = ids.findIndex((id) => id === currentId);
  const currentIndex =
    matchingIndex !== -1
      ? matchingIndex
      : currentIndexHint !== null && currentIndexHint >= 0 && currentIndexHint < ids.length
        ? currentIndexHint
        : -1;
  if (currentIndex === -1) return [];

  return [...new Set(ids.slice(currentIndex + 1).filter(Boolean))].slice(0, PREFETCH_COUNT);
}

export function selectInitialThreadIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))].slice(0, INITIAL_PREFETCH_COUNT);
}

/**
 * Select every thread the virtual list says is visible, plus the next two rows.
 * The bounds are clamped because Virtua can briefly report the previous range
 * while a page is appended. Keeping this selector pure makes the scroll-driven
 * prefetch policy deterministic and cheap to test.
 */
export function selectVisibleThreadIds(
  ids: readonly string[],
  startIndex: number,
  endIndex: number,
): string[] {
  if (
    ids.length === 0 ||
    !Number.isFinite(startIndex) ||
    !Number.isFinite(endIndex) ||
    endIndex < 0 ||
    startIndex >= ids.length
  ) {
    return [];
  }

  const start = Math.max(0, Math.floor(startIndex));
  const end = Math.min(
    ids.length - 1,
    Math.max(start, Math.floor(endIndex)) + VISIBLE_PREFETCH_AHEAD_COUNT,
  );

  return [...new Set(ids.slice(start, end + 1).filter(Boolean))];
}

export async function prefetchThreadIdsInBatches(
  ids: readonly string[],
  prefetch: (id: string) => Promise<unknown>,
  shouldContinue: () => boolean,
): Promise<boolean> {
  for (let index = 0; index < ids.length; index += VISIBLE_PREFETCH_BATCH_SIZE) {
    if (!shouldContinue()) return false;
    await Promise.all(ids.slice(index, index + VISIBLE_PREFETCH_BATCH_SIZE).map(prefetch));
  }

  return shouldContinue();
}

/**
 * Warm only the first three inbox rows once the lightweight list is ready.
 * This covers the first cold click after boot/account switch without reviving
 * the former per-row request storm; React Query deduplicates later hover/click
 * and adjacent-thread prefetches against the same cache keys.
 */
export function useInitialThreadPrefetch(threads: readonly { id: string }[], enabled: boolean) {
  const prefetchThread = usePrefetchThread();
  const selectedIds = useMemo(
    () => selectInitialThreadIds(threads.map((thread) => thread.id)),
    [threads],
  );

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!enabled || !shouldPrefetchThreadBodies(connection) || selectedIds.length === 0) return;

    void Promise.all(selectedIds.map((id) => prefetchThread(id).catch(() => undefined)));
  }, [enabled, prefetchThread, selectedIds]);
}

/**
 * Warms only the two threads ArrowDown will open next. The active thread must
 * already be rendered before this hook is enabled. Both requests start in the
 * effect's first tick so the tRPC batch link can share one HTTP request and one
 * getActiveConnection lookup, while the hard limit prevents the old row storm.
 */
export function useNextThreadPrefetch(
  threads: readonly { id: string }[],
  currentId: string | null,
  enabled: boolean,
  currentIndexHint: number | null = null,
) {
  const prefetchThread = usePrefetchThread();
  const selectedIds = useMemo(
    () =>
      selectNextThreadIds(
        threads.map((thread) => thread.id),
        currentId,
        currentIndexHint,
      ),
    [currentId, currentIndexHint, threads],
  );

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!enabled || !shouldPrefetchThreadBodies(connection) || selectedIds.length === 0) return;

    void Promise.all(selectedIds.map((id) => prefetchThread(id).catch(() => undefined)));
  }, [enabled, prefetchThread, selectedIds]);
}
