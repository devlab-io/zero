export type ThreadIdentity = { id: string };

export type ThreadTriageTransition<T extends ThreadIdentity> = {
  thread: T;
  /** Index of `thread` after `currentId` has been removed from the list. */
  focusedIndex: number;
};

/**
 * Resolve the next open thread from the immutable pre-mutation list.
 *
 * Looking up `currentId` prevents a stale focused index from skipping a row. The next item shifts
 * into the removed item's index, which is therefore also the focus index after the optimistic
 * mutation. A missing or last item closes deterministically.
 */
export function deriveThreadTriageTransition<T extends ThreadIdentity>(
  items: readonly T[],
  currentId: string,
): ThreadTriageTransition<T> | null {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) return null;

  const nextThread = items[currentIndex + 1];
  return nextThread ? { thread: nextThread, focusedIndex: currentIndex } : null;
}

export type ImportantToggleFeedback = {
  mutate: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
  onSuccess: () => void;
  onError: (error: unknown) => void;
};

/** Keep success and failure feedback coupled to the real mutation result. */
export async function runImportantToggle({
  mutate,
  refresh,
  onSuccess,
  onError,
}: ImportantToggleFeedback): Promise<boolean> {
  try {
    await mutate();
    await refresh();
    onSuccess();
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
