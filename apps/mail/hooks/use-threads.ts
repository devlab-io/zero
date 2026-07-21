import { queryOptions, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { backgroundQueueAtom, isThreadInBackgroundQueueAtom } from '@/store/backgroundQueue';
import { emailContentQueryKey, resolveEmailContentTheme } from '@/lib/email-content-query';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { useSearchValue } from '@/hooks/use-search-value';
import type { IGetThreadResponse } from '@zero/types';
import useSearchLabels from './use-labels-search';
import { useSession } from '@/lib/auth-client';
import { useAtom, useAtomValue } from 'jotai';
import { useSettings } from './use-settings';
import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import { useTheme } from 'next-themes';
import { useQueryState } from 'nuqs';

const THREAD_STALE_MS = 60 * 60 * 1000;

function useOpenThreadQueryOptions() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { resolvedTheme } = useTheme();
  const theme = resolveEmailContentTheme(resolvedTheme);
  const shouldLoadImages = Boolean(settings?.settings?.externalImages);

  return useCallback(
    (id: string, enabled = true) =>
      queryOptions({
        // Keep the historic mail.get cache key so websocket invalidations and
        // every existing consumer continue to target the same thread detail.
        queryKey: trpc.mail.get.queryKey({ id }),
        queryFn: async ({ signal }) => {
          const result = await trpcClient.mail.openThread.query(
            { id, shouldLoadImages, theme },
            { signal },
          );

          for (const [messageId, processed] of Object.entries(result.rendered)) {
            queryClient.setQueryData(
              emailContentQueryKey(messageId, shouldLoadImages, theme),
              processed,
            );
          }

          return result.thread;
        },
        enabled,
        staleTime: THREAD_STALE_MS,
        // Instant-from-IndexedDB, then silent background refresh: cached thread
        // renders immediately on open (persisted cache), and react-query refetches
        // in the background on every mount without blanking the view.
        refetchOnMount: 'always',
      }),
    [queryClient, shouldLoadImages, theme, trpc, trpcClient],
  );
}

export function usePrefetchThread() {
  const queryClient = useQueryClient();
  const openThreadQueryOptions = useOpenThreadQueryOptions();

  return useCallback(
    (id: string) => queryClient.prefetchQuery(openThreadQueryOptions(id)),
    [openThreadQueryOptions, queryClient],
  );
}

export const useThreads = () => {
  const { folder } = useParams<{ folder: string }>();
  const [searchValue] = useSearchValue();
  const [backgroundQueue] = useAtom(backgroundQueueAtom);
  const isInQueue = useAtomValue(isThreadInBackgroundQueueAtom);
  const trpc = useTRPC();
  const { labels } = useSearchLabels();

  const threadsQuery = useInfiniteQuery(
    trpc.mail.listThreads.infiniteQueryOptions(
      {
        q: searchValue.value,
        folder,
        labelIds: labels,
      },
      {
        initialCursor: '',
        getNextPageParam: (lastPage) => lastPage?.nextPageToken ?? null,
        staleTime: 60 * 1000 * 1, // 1 minute
        refetchOnMount: true,
        refetchIntervalInBackground: true,
      },
    ),
  );

  // Flatten threads from all pages and sort by receivedOn date (newest first)

  const threads = useMemo(() => {
    return threadsQuery.data
      ? threadsQuery.data.pages
          .flatMap((e) => e.threads)
          .filter(Boolean)
          .filter((e) => !isInQueue(`thread:${e.id}`))
      : [];
  }, [threadsQuery.data, threadsQuery.dataUpdatedAt, isInQueue, backgroundQueue]);

  const isEmpty = useMemo(() => threads.length === 0, [threads]);
  const isReachingEnd =
    isEmpty ||
    (threadsQuery.data &&
      !threadsQuery.data.pages[threadsQuery.data.pages.length - 1]?.nextPageToken);

  const loadMore = async () => {
    if (threadsQuery.isLoading || threadsQuery.isFetching) return;
    await threadsQuery.fetchNextPage();
  };

  return [threadsQuery, threads, isReachingEnd, loadMore] as const;
};

export const useThread = (threadId: string | null, options?: { enabled?: boolean }) => {
  const { data: session } = useSession();
  const [_threadId] = useQueryState('threadId');
  const id = threadId ? threadId : _threadId;
  const openThreadQueryOptions = useOpenThreadQueryOptions();
  const queryClient = useQueryClient();
  const prefetch = useCallback(
    () => (id ? queryClient.prefetchQuery(openThreadQueryOptions(id)) : Promise.resolve()),
    [id, openThreadQueryOptions, queryClient],
  );

  // #30: list rows served from the rich projection pass { enabled: false } so opening the
  // inbox triggers NO per-row mail.get (and no processEmailContent). The body is fetched
  // only for the active thread and for thin paths (search) that lack the projection.
  const threadQuery = useQuery(
    openThreadQueryOptions(
      id ?? '',
      (options?.enabled ?? true) && Boolean(id) && Boolean(session?.user?.id),
    ),
  );

  const { latestDraft, isGroupThread, finalData } = useMemo(() => {
    if (!threadQuery.data) {
      return {
        latestDraft: undefined,
        isGroupThread: false,
        finalData: undefined,
      };
    }

    const latestDraft = threadQuery.data.latest?.id
      ? threadQuery.data.messages.findLast((e) => e.isDraft)
      : undefined;

    const isGroupThread = threadQuery.data.latest?.id
      ? (() => {
          const totalRecipients = [
            ...(threadQuery.data.latest.to || []),
            ...(threadQuery.data.latest.cc || []),
            ...(threadQuery.data.latest.bcc || []),
          ].length;
          return totalRecipients > 1;
        })()
      : false;

    const nonDraftMessages = threadQuery.data.messages.filter((e) => !e.isDraft);
    const finalData: IGetThreadResponse = {
      ...threadQuery.data,
      messages: nonDraftMessages,
    };

    return { latestDraft, isGroupThread, finalData };
  }, [threadQuery.data]);

  return {
    ...threadQuery,
    data: finalData,
    isGroupThread,
    latestDraft,
    prefetch,
  };
};
