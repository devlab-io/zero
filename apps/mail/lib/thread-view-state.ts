/**
 * Honest active-thread view state (issue #34, check point 3; barème axis A9).
 *
 * A failed thread fetch renders a FINITE error state (retry/back), never an
 * endless skeleton. This pure selector is the single decision seam consumed by
 * `components/mail/thread-display.tsx`.
 */

export type ThreadViewState = 'no-selection' | 'loading' | 'error' | 'ready';

export interface ThreadViewStateInput {
  /** A thread is selected (threadId present). */
  hasSelection: boolean;
  /** The thread body has resolved. */
  hasData: boolean;
  /** The thread query is genuinely in flight. */
  isLoading: boolean;
  /** The thread query resolved to an error (500, network, offline fetch reject). */
  isError: boolean;
  /** The browser reports no connectivity. */
  isOffline: boolean;
}

/**
 * - no selection              → `no-selection`
 * - data present              → `ready`
 * - failure/offline, no data  → `error`   (finite, retry/back — never a skeleton)
 * - loading, no data          → `loading` (skeleton ONLY while genuinely in flight)
 * - resolved without data     → `error`   (defensive: never an endless skeleton)
 */
export function selectThreadViewState(input: ThreadViewStateInput): ThreadViewState {
  const { hasSelection, hasData, isLoading, isError, isOffline } = input;
  if (!hasSelection) return 'no-selection';
  if (hasData) return 'ready';
  if (isError || isOffline) return 'error';
  if (isLoading) return 'loading';
  return 'error';
}
