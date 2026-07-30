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
