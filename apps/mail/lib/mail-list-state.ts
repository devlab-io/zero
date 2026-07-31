/**
 * Honest mail-list view state (issue #34, check points 1 & 2; barème axis A9).
 *
 * A read FAILURE must NEVER render as "empty" and cached rows must survive a
 * failed refresh. This pure selector is the single decision seam consumed by
 * `components/mail/mail-list.tsx`.
 */

export type MailListViewState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';

export interface MailListStateInput {
  /** Number of cached/loaded thread rows currently available. */
  itemCount: number;
  /** First load in flight with no data yet. */
  isLoading: boolean;
  /** IndexedDB query-cache hydration is still restoring persisted rows. */
  isRestoring?: boolean;
  /** A new search/folder key is still resolving from placeholder data. */
  isTransitionPending?: boolean;
  /** A background refresh is running, including over a cached empty page. */
  isFetching?: boolean;
  /** The list query resolved to an error (500, network, offline fetch reject). */
  isError: boolean;
  /** The browser reports no connectivity. */
  isOffline: boolean;
}

/**
 * - rows present + failure/offline → `stale` (keep the cached rows, show a notice)
 * - rows present + healthy         → `ready`
 * - no rows + loading              → `loading`
 * - no rows + failure/offline      → `error`  (explicit error + retry, NEVER empty)
 * - no rows + resolved healthy     → `empty`  (the only honest empty)
 */
export function selectMailListState(input: MailListStateInput): MailListViewState {
  const {
    itemCount,
    isLoading,
    isRestoring = false,
    isTransitionPending = false,
    isFetching = false,
    isError,
    isOffline,
  } = input;
  if (itemCount > 0) {
    return isError || isOffline ? 'stale' : 'ready';
  }
  if (isLoading || isRestoring || isTransitionPending || isFetching) return 'loading';
  if (isError || isOffline) return 'error';
  return 'empty';
}
