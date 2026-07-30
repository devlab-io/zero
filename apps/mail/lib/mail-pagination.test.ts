import { shouldLoadNextMailPage } from './mail-pagination';
import { describe, expect, it } from 'vitest';

describe('shouldLoadNextMailPage', () => {
  it('starts the next page before the user reaches the loaded boundary', () => {
    expect(
      shouldLoadNextMailPage({
        remainingItems: 14,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);
  });

  it.each([
    { remainingItems: 15, isLoading: false, isFetchingNextPage: false, hasNextPage: true },
    { remainingItems: 2, isLoading: true, isFetchingNextPage: false, hasNextPage: true },
    { remainingItems: 2, isLoading: false, isFetchingNextPage: true, hasNextPage: true },
    { remainingItems: 2, isLoading: false, isFetchingNextPage: false, hasNextPage: false },
  ])('does not load for %o', (state) => {
    expect(shouldLoadNextMailPage(state)).toBe(false);
  });
});
