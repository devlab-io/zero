import { hasCompleteThreadBodies } from '@/lib/thread-detail-cache';

/**
 * A thread can change outside RETA (Shortwave, Gmail mobile, another tab).
 * The legacy agent websocket is no longer mounted by the frontend, so a
 * complete cached body must still be reconciled on focus and at a bounded
 * interval while the reader is visible.
 */
export const THREAD_DETAIL_STALE_MS = 30 * 1000;
export const THREAD_DETAIL_RECONCILE_MS = 60 * 1000;

export const threadDetailStaleTime = (data: unknown) =>
  hasCompleteThreadBodies(data) ? THREAD_DETAIL_STALE_MS : 0;

export const threadDetailQueryBehavior = (enabled: boolean) => ({
  refetchOnMount: enabled,
  refetchOnWindowFocus: enabled ? ('always' as const) : false,
  refetchInterval: enabled ? THREAD_DETAIL_RECONCILE_MS : (false as const),
  refetchIntervalInBackground: false,
});
