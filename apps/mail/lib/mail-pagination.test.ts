import { shouldExtendReaderPages, shouldLoadNextMailPage } from './mail-pagination';
import { describe, expect, it } from 'vitest';

describe('shouldLoadNextMailPage', () => {
  it('starts the next page a full server page before the loaded boundary', () => {
    expect(
      shouldLoadNextMailPage({
        remainingItems: 19,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);
  });

  it.each([
    { remainingItems: 20, isLoading: false, isFetchingNextPage: false, hasNextPage: true },
    { remainingItems: 2, isLoading: true, isFetchingNextPage: false, hasNextPage: true },
    { remainingItems: 2, isLoading: false, isFetchingNextPage: true, hasNextPage: true },
    { remainingItems: 2, isLoading: false, isFetchingNextPage: false, hasNextPage: false },
  ])('does not load for %o', (state) => {
    expect(shouldLoadNextMailPage(state)).toBe(false);
  });
});

describe('shouldExtendReaderPages', () => {
  it('extends the list when the reader nears the loaded boundary', () => {
    expect(
      shouldExtendReaderPages({
        index: 14,
        itemCount: 20,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);
    expect(
      shouldExtendReaderPages({
        index: 19,
        itemCount: 20,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);
  });

  it.each([
    // Reader far from the boundary: no speculative page.
    { index: 3, itemCount: 20, isFetchingNextPage: false, hasNextPage: true },
    // Unresolved reader position (id absent and no usable focus hint).
    { index: -1, itemCount: 20, isFetchingNextPage: false, hasNextPage: true },
    // A page fetch is already in flight.
    { index: 19, itemCount: 20, isFetchingNextPage: true, hasNextPage: true },
    // Nothing left server-side.
    { index: 19, itemCount: 20, isFetchingNextPage: false, hasNextPage: false },
    // Empty list.
    { index: 0, itemCount: 0, isFetchingNextPage: false, hasNextPage: true },
  ])('does not extend for %o', (state) => {
    expect(shouldExtendReaderPages(state)).toBe(false);
  });
});
