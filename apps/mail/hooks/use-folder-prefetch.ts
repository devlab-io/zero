import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { useCallback, useEffect } from 'react';
import { FOLDERS } from '@/lib/utils';

const FOLDER_LIST_STALE_MS = 5 * 60 * 1000;

export const CORE_MAIL_FOLDER_PREFETCH_ORDER = [
  FOLDERS.BIN,
  FOLDERS.SENT,
  FOLDERS.ARCHIVE,
  FOLDERS.SNOOZED,
  FOLDERS.SPAM,
  FOLDERS.DRAFT,
] as const;

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

/** Warm every sidebar destination without delaying the authenticated Inbox. */
export function useWarmCoreMailFolders(enabled: boolean, currentFolder: string) {
  const prefetchFolder = usePrefetchMailFolder();

  useEffect(() => {
    if (!enabled || currentFolder !== FOLDERS.INBOX || typeof window === 'undefined') return;

    // Projection-backed folders are cheap and must all be hot before a rapid
    // Drafts → Sent (or any sidebar) sequence. Start them together immediately;
    // the server resolves the batch in one DO wake-up. Draft fans a Gmail list
    // call out into detail reads, so start it in the next macrotask and never
    // put that slower path on the projection batch's response path.
    void Promise.all(
      CORE_MAIL_FOLDER_PREFETCH_ORDER.slice(0, -1).map((folder) =>
        prefetchFolder(folder).catch(() => undefined),
      ),
    );
    const draftTimerId = window.setTimeout(() => void prefetchFolder(FOLDERS.DRAFT), 0);
    return () => window.clearTimeout(draftTimerId);
  }, [currentFolder, enabled, prefetchFolder]);
}
