/**
 * Honest active-thread view state (issue #34, check point 3; barème axis A9).
 *
 * A failed thread fetch renders a FINITE error state (retry/back), never an
 * endless skeleton. This pure selector is the single decision seam consumed by
 * `components/mail/thread-display.tsx`.
 */

export type ThreadViewState = 'no-selection' | 'loading' | 'error' | 'ready';

/**
 * Shell optimiste d'ouverture de fil (CUA 2026-07-30, échecs 3-4) : pendant le
 * fetch `openThread` (~900 ms à froid), la ligne de LISTE porte déjà
 * sujet/expéditeur/date (projection). Ce sélecteur choisit la ligne à peindre
 * au-dessus du squelette — uniquement si elle est riche (un sujet présent) :
 * une ligne mince (recherche Gmail) n'apporte rien → squelette seul, comme avant.
 */
export function selectThreadShellRow<T extends { id: string; subject?: string }>(
  items: T[],
  threadId: string | null,
): T | undefined {
  if (!threadId) return undefined;
  const row = items.find((item) => item.id === threadId);
  return row?.subject ? row : undefined;
}

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
