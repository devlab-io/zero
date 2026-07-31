export const DEFAULT_VISIBLE_SIDEBAR_LABELS = 8;

export type RankedSidebarLabel = {
  name: string;
  count: number;
};

const labelCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** Most-used labels first; stable human alphabetical order at equal counts. */
export function rankSidebarLabels<T extends RankedSidebarLabel>(labels: readonly T[]): T[] {
  return [...labels].sort(
    (left, right) => right.count - left.count || labelCollator.compare(left.name, right.name),
  );
}

export function visibleSidebarLabels<T>(
  labels: readonly T[],
  expanded: boolean,
  limit = DEFAULT_VISIBLE_SIDEBAR_LABELS,
): T[] {
  return expanded ? [...labels] : labels.slice(0, limit);
}

export function isSidebarLabelToggleKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}
