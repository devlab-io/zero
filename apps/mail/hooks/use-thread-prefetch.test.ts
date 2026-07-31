import {
  selectInitialThreadIds,
  selectNextThreadIds,
  selectVisibleThreadIds,
  shouldPrefetchThreadBodies,
} from './use-thread-prefetch';
import { describe, expect, it } from 'vitest';

describe('targeted thread prefetch', () => {
  it('does not prefetch on data saver or 2g', () => {
    expect(shouldPrefetchThreadBodies({ saveData: true })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '2g' })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '4g' })).toBe(true);
  });

  it('warms only the first three unique list rows on a cold inbox', () => {
    expect(selectInitialThreadIds(['a', 'b', 'a', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(selectInitialThreadIds([])).toEqual([]);
  });

  it('selects only the two unique threads after the active one', () => {
    expect(selectNextThreadIds(['a', 'b', 'b', 'c', 'd'], 'a')).toEqual(['b', 'c']);
    expect(selectNextThreadIds(['a', 'b', 'c', 'd'], 'b')).toEqual(['c', 'd']);
  });

  it('does nothing when the active thread is absent or already last', () => {
    expect(selectNextThreadIds(['a', 'b'], 'missing')).toEqual([]);
    expect(selectNextThreadIds(['a', 'b'], 'b')).toEqual([]);
    expect(selectNextThreadIds(['a', 'b'], null)).toEqual([]);
  });

  it('uses the focused row when the open thread uses another projection id', () => {
    expect(selectNextThreadIds(['a', 'b', 'c', 'd'], 'message-id', 1)).toEqual(['c', 'd']);
  });

  it('warms the full visible window and the next two rows after a scroll', () => {
    expect(selectVisibleThreadIds(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 2, 4)).toEqual([
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
  });

  it('clamps stale virtual ranges and removes duplicate thread ids', () => {
    expect(selectVisibleThreadIds(['a', 'a', 'b', 'c'], -2, 1)).toEqual(['a', 'b', 'c']);
    expect(selectVisibleThreadIds(['a', 'b'], 5, 7)).toEqual([]);
    expect(selectVisibleThreadIds([], 0, 0)).toEqual([]);
  });
});
