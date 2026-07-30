import type { QueryClient } from '@tanstack/react-query';

/**
 * Refresh account-scoped reads without destroying their active observers.
 *
 * `QueryClient.clear()` removes queries from the cache entirely. Components that
 * were already mounted can then stay attached to removed queries, so the
 * following `refetchQueries()` finds nothing to refetch. That left the account
 * header and inbox on different connections until an unrelated event triggered
 * another fetch.
 */
export async function refreshActiveQueriesAfterAccountSwitch(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  await queryClient.invalidateQueries({ refetchType: 'active' });
}
