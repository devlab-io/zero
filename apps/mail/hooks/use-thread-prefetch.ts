import { usePrefetchThread } from '@/hooks/use-threads';
import { useEffect, useMemo } from 'react';

const PREFETCH_COUNT = 3;
const START_DELAY_MS = 750;

export type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

export function shouldPrefetchThreadBodies(connection?: NetworkInformation): boolean {
  if (connection?.saveData) return false;
  return !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}

export function selectRecentThreadIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))].slice(0, PREFETCH_COUNT);
}

/**
 * Warms only the most probable next opens. Requests run sequentially after the
 * inbox is interactive so they never compete with the list's critical path.
 */
export function useRecentThreadPrefetch(ids: readonly string[]) {
  const prefetchThread = usePrefetchThread();
  const selectedIds = useMemo(() => selectRecentThreadIds(ids), [ids]);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!shouldPrefetchThreadBodies(connection) || selectedIds.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const id of selectedIds) {
          if (cancelled) return;
          await prefetchThread(id);
        }
      })();
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [prefetchThread, selectedIds]);
}
