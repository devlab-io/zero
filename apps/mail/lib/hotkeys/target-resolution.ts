// Devlab: single source of truth for list-hotkey targeting. A live bulk selection wins;
// otherwise keyboard focus (j/k) wins over incidental pointer position, then hover is the
// fallback for pointer-driven actions. Returns [] when nothing is targeted.
export function resolveRowTargetId(
  hoveredId: string | null,
  focusedIndex: number | null,
  items: ReadonlyArray<{ id: string }>,
): string | null {
  if (focusedIndex !== null) {
    const focused = items[focusedIndex];
    if (focused) return focused.id;
  }
  return hoveredId;
}

export function resolveTargetIds(
  hoveredId: string | null,
  focusedIndex: number | null,
  items: ReadonlyArray<{ id: string }>,
  bulkSelected: string[],
): string[] {
  if (bulkSelected.length > 0) return bulkSelected;
  const rowTargetId = resolveRowTargetId(hoveredId, focusedIndex, items);
  return rowTargetId ? [rowTargetId] : [];
}
