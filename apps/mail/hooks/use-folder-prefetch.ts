import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { useCallback, useEffect } from 'react';
import { FOLDERS } from '@/lib/utils';

const FOLDER_LIST_STALE_MS = 5 * 60 * 1000;

export function mailFolderFromHref(href: string): string | null {
  const match = /^\/mail\/([^/?#]+)/.exec(href);
  return match?.[1] ?? null;
}

export function usePrefetchMailFolder() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useCallback(
    (folder: string) =>
      queryClient.prefetchInfiniteQuery(
        trpc.mail.listThreads.infiniteQueryOptions(
          { q: '', folder, labelIds: [] },
          {
            initialCursor: '',
            getNextPageParam: (lastPage) => lastPage?.nextPageToken ?? null,
            staleTime: FOLDER_LIST_STALE_MS,
          },
        ),
      ),
    [queryClient, trpc],
  );
}

/** Warm the two most common destinations without delaying their first human click. */
export function useWarmCoreMailFolders(enabled: boolean, currentFolder: string) {
  const prefetchFolder = usePrefetchMailFolder();

  useEffect(() => {
    if (!enabled || currentFolder !== FOLDERS.INBOX || typeof window === 'undefined') return;

    // Drafts fans one Gmail list call out into detail reads. Kick it off as soon
    // as the authenticated shell commits so the network work overlaps Inbox;
    // even a 500 ms idle delay still produced a visible ~200 ms skeleton flash.
    void prefetchFolder(FOLDERS.DRAFT);

    const warmSent = () => void prefetchFolder(FOLDERS.SENT);

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warmSent, { timeout: 500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timerId = window.setTimeout(warmSent, 0);
    return () => window.clearTimeout(timerId);
  }, [currentFolder, enabled, prefetchFolder]);
}
