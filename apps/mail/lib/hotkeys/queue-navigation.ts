export type QueueFocusDirection = 'next' | 'previous';

/**
 * Resolve the queue selection against the currently visible items.
 *
 * Navigation wraps at both ends. When the current selection is absent from the filtered list,
 * next starts at the first visible item and previous starts at the last visible item.
 */
export function resolveQueueSelectionId(
  visibleItems: readonly { id: string }[],
  selectedItemId: string | null,
  direction: QueueFocusDirection,
): string | null {
  if (visibleItems.length === 0) return null;

  const selectedIndex = visibleItems.findIndex((item) => item.id === selectedItemId);
  if (selectedIndex === -1) {
    return direction === 'next' ? (visibleItems[0]?.id ?? null) : (visibleItems.at(-1)?.id ?? null);
  }

  const offset = direction === 'next' ? 1 : -1;
  const nextIndex = (selectedIndex + offset + visibleItems.length) % visibleItems.length;
  return visibleItems[nextIndex]?.id ?? null;
}
