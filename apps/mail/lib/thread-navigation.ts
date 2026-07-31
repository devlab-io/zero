export function selectAdjacentThreadTarget<T extends { id: string }>(
  items: readonly T[],
  currentId: string,
  direction: 'next' | 'previous',
  currentIndexHint: number | null = null,
): { targetId: string; index: number } | null {
  const matchingIndex = items.findIndex((item) => item.id === currentId);
  const currentIndex =
    matchingIndex !== -1
      ? matchingIndex
      : currentIndexHint !== null && currentIndexHint >= 0 && currentIndexHint < items.length
        ? currentIndexHint
        : -1;
  if (currentIndex === -1) return null;

  const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  const target = items[targetIndex];
  return target ? { targetId: target.id, index: targetIndex } : null;
}

/** Avoid an idempotent-but-expensive label mutation for threads already read. */
export function shouldMarkAdjacentThreadRead(item?: { unread?: boolean }): boolean {
  return item?.unread === true;
}

export type ThreadDisplayCaptureAction = 'next' | 'previous' | 'close' | null;

/**
 * Resolve the reader-level keys that must keep working even when focus sits in
 * the isolated message content tree. Typing surfaces and modifier chords keep
 * ownership of their keys, especially Escape inside a reply composer.
 */
export function resolveThreadDisplayCaptureAction(input: {
  key: string;
  hasModifier: boolean;
  isTypingOrModal: boolean;
}): ThreadDisplayCaptureAction {
  if (input.hasModifier || input.isTypingOrModal) return null;
  if (input.key === 'ArrowDown') return 'next';
  if (input.key === 'ArrowUp') return 'previous';
  if (input.key === 'Escape') return 'close';
  return null;
}
