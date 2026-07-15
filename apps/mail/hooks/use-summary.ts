import { useSecondaryQueriesEnabled } from '@/hooks/use-secondary-queries';
import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';

export const useSummary = (threadId: string | null) => {
  const trpc = useTRPC();
  // Secondary on thread open — generateSummary is the single most expensive call of
  // the open path (AI); it must never race the body for the network.
  const secondaryEnabled = useSecondaryQueriesEnabled();
  const summaryQuery = useQuery(
    trpc.brain.generateSummary.queryOptions(
      { threadId: threadId ?? '' },
      {
        enabled: !!threadId && secondaryEnabled,
      },
    ),
  );

  return summaryQuery;
};

export const useBrainState = () => {
  const trpc = useTRPC();
  const brainStateQuery = useQuery(
    trpc.brain.getState.queryOptions(undefined, {
      staleTime: 1000 * 60 * 60, // 1 hour
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  );

  return brainStateQuery;
};
