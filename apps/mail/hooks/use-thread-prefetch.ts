import { getThreadPrefetchIds, THREAD_BODY_PREFETCH_COUNT } from '@/lib/thread-prefetch';
import { trpcClient, useTRPC } from '@/providers/query-provider';
import { useSearchValue } from '@/hooks/use-search-value';
import { drainPrefetchQueue } from '@/lib/prefetch-queue';
import useSearchLabels from '@/hooks/use-labels-search';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { FOLDERS } from '@/lib/utils';
import { log } from '@/lib/log';

/** Never more than this many mail.get fetches in flight (httpBatchLink maxItems:1 → 1 HTTP request each). */
const PREFETCH_CONCURRENCY = 3;
const LIST_PAGE_SIZE = 20;
/** Let the list paint and the critical queries win the network before warming the cache. */
const PREFETCH_START_DELAY_MS = 1500;
/** Short enough that a refreshed list cannot leave an updated conversation stale for long. */
const PREFETCH_STALE_TIME_MS = 1000 * 60;

/**
 * Devlab — warm the thread-body cache for the newest THREAD_BODY_PREFETCH_COUNT rows of
 * the current folder, so opening any of them is served from cache instead of paying the
 * mail.get round trip. Entries land in the normal react-query cache and are therefore
 * PERSISTED by the IDB persister (PersistQueryClientProvider) — a reload restores them
 * and the inbox stays instant across sessions.
 *
 * Deliberately conservative: starts after a delay, stops starting new work as soon as a
 * thread opens, drains with bounded concurrency, refreshes stale bodies after one minute,
 * and stays inert during a search and in drafts.
 */
export function usePrefetchThreadBodies(
  items: ReadonlyArray<{ id: string }>,
  activeThreadId: string | null,
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [searchValue] = useSearchValue();
  const { labels: labelIds } = useSearchLabels();
  const labelIdsKey = labelIds.join('\n');
  const { folder } = useParams<{ folder: string }>();
  const isSearching = searchValue.value.trim().length > 0;

  // Fingerprint of the top slice: the effect re-arms only when those ids actually change,
  // not on every unrelated render of the list.
  const idsKey = useMemo(() => getThreadPrefetchIds(items).join('\n'), [items]);

  useEffect(() => {
    if (!idsKey || isSearching || activeThreadId || folder === FOLDERS.DRAFT) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const ids = idsKey.split('\n');

          if (ids.length < THREAD_BODY_PREFETCH_COUNT) {
            let cursor = '';
            while (ids.length < THREAD_BODY_PREFETCH_COUNT && !cancelled) {
              const page = await trpcClient.mail.listThreads.query({
                folder,
                q: '',
                labelIds: labelIdsKey ? labelIdsKey.split('\n') : [],
                maxResults: LIST_PAGE_SIZE,
                cursor,
              });

              for (const thread of page.threads) {
                if (!ids.includes(thread.id)) ids.push(thread.id);
                if (ids.length === THREAD_BODY_PREFETCH_COUNT) break;
              }

              if (!page.nextPageToken || page.nextPageToken === cursor) break;
              cursor = page.nextPageToken;
            }
          }

          await drainPrefetchQueue(
            ids,
            (id) =>
              queryClient.prefetchQuery(
                trpc.mail.get.queryOptions(
                  { id },
                  {
                    staleTime: PREFETCH_STALE_TIME_MS,
                    meta: { persist: true },
                  },
                ),
              ),
            PREFETCH_CONCURRENCY,
            () => cancelled || (typeof navigator !== 'undefined' && !navigator.onLine),
          );
        } catch (error) {
          log.warn('Failed to warm thread bodies', error);
        }
      })();
    }, PREFETCH_START_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [idsKey, isSearching, activeThreadId, folder, labelIdsKey, queryClient, trpc]);
}
