import { selectNextThreadIds, shouldPrefetchThreadBodies } from './use-thread-prefetch';
import { describe, expect, it } from 'vitest';

describe('targeted thread prefetch', () => {
  it('does not prefetch on data saver or 2g', () => {
    expect(shouldPrefetchThreadBodies({ saveData: true })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '2g' })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '4g' })).toBe(true);
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
});
