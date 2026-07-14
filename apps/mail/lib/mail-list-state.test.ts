import { describe, expect, it } from 'vitest';
import { selectMailListState } from './mail-list-state';

// Issue #34, check points 1 & 2 (barème A9): a failed read NEVER renders "empty",
// and cached rows survive a failed refresh.

describe('selectMailListState', () => {
  it('uncached 500/offline → error (never empty)', () => {
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: true, isOffline: false }),
    ).toBe('error');
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: false, isOffline: true }),
    ).toBe('error');
  });

  it('cached refresh failure → stale (rows kept + notice)', () => {
    expect(
      selectMailListState({ itemCount: 12, isLoading: false, isError: true, isOffline: false }),
    ).toBe('stale');
    expect(
      selectMailListState({ itemCount: 12, isLoading: false, isError: false, isOffline: true }),
    ).toBe('stale');
  });

  it('first load in flight with no data → loading', () => {
    expect(
      selectMailListState({ itemCount: 0, isLoading: true, isError: false, isOffline: false }),
    ).toBe('loading');
  });

  it('resolved healthy with no rows → the only honest empty', () => {
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: false, isOffline: false }),
    ).toBe('empty');
  });

  it('rows present + healthy → ready', () => {
    expect(
      selectMailListState({ itemCount: 5, isLoading: false, isError: false, isOffline: false }),
    ).toBe('ready');
  });

  it('an error with cached rows is never reported as empty', () => {
    const state = selectMailListState({
      itemCount: 3,
      isLoading: false,
      isError: true,
      isOffline: false,
    });
    expect(state).not.toBe('empty');
  });
});
