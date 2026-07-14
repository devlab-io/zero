import { useCallback, useMemo } from 'react';
import { useQueryState } from 'nuqs';

export type MailFilterState = {
  searchText: string;
  labels: readonly string[];
  category: string | null;
  activeFilterCount: number;
};

/** Keep the empty-state decision aligned with every filter source consumed by the mail query. */
export function hasActiveMailFilters({
  searchText,
  labels,
  category,
  activeFilterCount,
}: MailFilterState): boolean {
  return (
    searchText.trim().length > 0 || labels.length > 0 || category !== null || activeFilterCount > 0
  );
}

type ClearMailQueryFiltersOptions = {
  setLabels: (labels: string[]) => void;
  setCategory: (category: string | null) => void;
};

/** Clear the two URL-backed filter sources through the same setters used by their controls. */
export function clearMailQueryFilters({
  setLabels,
  setCategory,
}: ClearMailQueryFiltersOptions): void {
  setLabels([]);
  setCategory(null);
}

const useSearchLabels = () => {
  const [data, setData] = useQueryState('labels');

  const labels = useMemo(() => {
    return data?.split(',').map((label) => label.trim()) ?? [];
  }, [data]);

  const setLabels = useCallback(
    (labels: string[]) => {
      if (labels.length === 0) {
        setData(null);
        return;
      }
      setData(labels.join(','));
    },
    [setData],
  );

  return { labels, setLabels };
};

export default useSearchLabels;
