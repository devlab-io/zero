import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

type AccountSwitchRefreshOptions = {
  infiniteQueryKey?: QueryKey;
};

/**
 * Refresh account-scoped reads without destroying their active observers.
 *
 * `QueryClient.clear()` removes queries from the cache entirely. Components that
 * were already mounted can then stay attached to removed queries, so the
 * following `refetchQueries()` finds nothing to refetch. That left the account
 * header and inbox on different connections until an unrelated event triggered
 * another fetch.
 */
export async function refreshActiveQueriesAfterAccountSwitch(
  queryClient: QueryClient,
  { infiniteQueryKey }: AccountSwitchRefreshOptions = {},
) {
  await queryClient.cancelQueries();

  // An infinite-query refetch replays every loaded page sequentially. After a
  // long inbox scroll that made account switches look frozen for 10-20 seconds.
  // The old account is hidden by the switch overlay, so only retain page one
  // before refetching; the target account becomes usable after one round-trip
  // and deeper pages are loaded normally on demand.
  if (infiniteQueryKey) {
    queryClient.setQueriesData<InfiniteData<unknown>>({ queryKey: infiniteQueryKey }, (data) => {
      if (!data || data.pages.length <= 1) return data;
      return {
        pages: data.pages.slice(0, 1),
        pageParams: data.pageParams.slice(0, 1),
      };
    });
  }

  await queryClient.invalidateQueries({ refetchType: 'active' });
}
