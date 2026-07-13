/**
 * Recovery affordance for a failed optimistic action (issue #34, check point 6).
 *
 * Every optimistic mutation (archive/star/read/snooze/…) is retryable: a failed
 * attempt means the server state did not change, so re-applying the same intent
 * once reaches the target. The CALLER reconciles first (undo the optimistic hide +
 * refetch the list) and then shows this toast so the user can retry. This pure
 * builder is the test seam.
 */

export interface OptimisticFailureHandlers {
  /** Localised "Action failed". */
  failedLabel: string;
  /** Localised "Retry". */
  retryLabel: string;
  /** Re-applies the original action intent. */
  onRetry: () => void;
}

export interface OptimisticFailureToast {
  message: string;
  action: { label: string; onClick: () => void };
  duration: number;
}

export function buildOptimisticFailureToast(
  handlers: OptimisticFailureHandlers,
): OptimisticFailureToast {
  return {
    message: handlers.failedLabel,
    action: { label: handlers.retryLabel, onClick: handlers.onRetry },
    duration: 8000,
  };
}

/**
 * Whether a completing optimistic action is the LAST pending one of its type — the
 * signal to run the single success-path reconciliation refresh.
 *
 * MUST be evaluated on the pending count BEFORE the action is removed from the set.
 * Routed fix (#35): the previous code read `set.size === 1` AFTER deleting the entry
 * from that same set, so for a lone action the size was already 0 and the refresh
 * was dead. Capturing the count first restores the reconciliation.
 */
export function isLastPendingOfType(pendingCountBeforeRemoval: number): boolean {
  return pendingCountBeforeRemoval === 1;
}
