import { shouldLoadNextDraftPage } from './draft-workspace-model';
import { useEffect } from 'react';

type AutoLoadDraftPageOptions = {
  rowCount: number;
  search: string;
  hasNextPage: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => unknown;
};

export const useAutoLoadDraftPage = ({
  rowCount,
  search,
  hasNextPage,
  isLoading,
  isFetchingNextPage,
  loadMore,
}: AutoLoadDraftPageOptions) => {
  useEffect(() => {
    if (
      shouldLoadNextDraftPage({
        rowCount,
        search,
        hasNextPage,
        isLoading,
        isFetchingNextPage,
      })
    ) {
      void loadMore();
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, loadMore, rowCount, search]);
};
