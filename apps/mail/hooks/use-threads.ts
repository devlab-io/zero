import { backgroundQueueAtom, isThreadInBackgroundQueueAtom } from '@/store/backgroundQueue';
import { emailContentQueryKey, resolveEmailContentTheme } from '@/lib/email-content-cache';
import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { useSearchValue } from '@/hooks/use-search-value';
import type { IGetThreadResponse } from '@zero/types';
import { useTRPC } from '@/providers/query-provider';
import useSearchLabels from './use-labels-search';
import { useSession } from '@/lib/auth-client';
import { useAtom, useAtomValue } from 'jotai';
import { useSettings } from './use-settings';
import { useParams } from 'react-router';
import { useTheme } from 'next-themes';
import { useQueryState } from 'nuqs';
import { useMemo } from 'react';

export const useThreads = () => {
  const { folder } = useParams<{ folder: string }>();
  const [searchValue] = useSearchValue();
  const [backgroundQueue] = useAtom(backgroundQueueAtom);
  const isInQueue = useAtomValue(isThreadInBackgroundQueueAtom);
  const trpc = useTRPC();
  const { labels } = useSearchLabels();

  // Keep the default 20-row first page: server-utils routes that exact request through
  // the active-shard fast path. The body warmer expands to 50 only after first paint.
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
  const trpc = useTRPC();
  const { data: settings } = useSettings();
  const { resolvedTheme } = useTheme();

  // #30: list rows served from the rich projection pass { enabled: false } so opening the
  // inbox triggers NO per-row mail.get (and no processEmailContent). The body is fetched
  // only for the active thread and for thin paths (search) that lack the projection.
  const threadQuery = useQuery(
    trpc.mail.get.queryOptions(
      {
        id: id ?? '',
      },
      {
        enabled: (options?.enabled ?? true) && !!id && !!session?.user?.id,
        staleTime: 1000 * 60 * 60, // 1 minute
      },
    ),
  );

  const { latestDraft, isGroupThread, finalData, latestMessage } = useMemo(() => {
    if (!threadQuery.data) {
      return {
        latestDraft: undefined,
        isGroupThread: false,
        finalData: undefined,
        latestMessage: undefined,
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
    const latestMessage = nonDraftMessages[nonDraftMessages.length - 1];

    const finalData: IGetThreadResponse = {
      ...threadQuery.data,
      messages: nonDraftMessages,
    };

    return { latestDraft, isGroupThread, finalData, latestMessage };
  }, [threadQuery.data]);

  const { mutateAsync: processEmailContent } = useMutation(
    trpc.mail.processEmailContent.mutationOptions(),
  );

  // Extract image loading condition to avoid duplication
  const shouldLoadImages = useMemo(() => {
    if (!settings?.settings || !latestMessage?.sender?.email) return false;

    return (
      settings.settings.externalImages ||
      settings.settings.trustedSenders?.includes(latestMessage.sender.email) ||
      false
    );
  }, [settings?.settings, latestMessage?.sender?.email]);

  const contentTheme = resolveEmailContentTheme(resolvedTheme);

  // Prefetch query - intentionally unused, just for caching.
  // CONTRACT: key and inputs MUST mirror the consumer in mail-content.tsx (same
  // ['email-content', messageId, shouldLoadImages, theme] key, same effective theme fed
  // to processEmailContent). A normalized light/dark value avoids the initial
  // next-themes `undefined` key missing after hydration resolves.
  useQuery({
    queryKey: emailContentQueryKey(latestMessage?.id, shouldLoadImages, contentTheme),
    queryFn: async () => {
      if (!latestMessage?.decodedBody || !settings?.settings) return null;

      const result = await processEmailContent({
        html: latestMessage.decodedBody,
        shouldLoadImages,
        theme: contentTheme,
      });

      return {
        html: result.processedHtml,
        hasBlockedImages: result.hasBlockedImages,
      };
    },
    enabled: !!latestMessage?.decodedBody && !!settings?.settings,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return { ...threadQuery, data: finalData, isGroupThread, latestDraft };
};
