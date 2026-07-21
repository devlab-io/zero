import { selectRecentThreadIds, shouldPrefetchThreadBodies } from './use-thread-prefetch';
import { describe, expect, it } from 'vitest';

describe('targeted thread prefetch', () => {
  it('does not prefetch on data saver or 2g', () => {
    expect(shouldPrefetchThreadBodies({ saveData: true })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '2g' })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '4g' })).toBe(true);
  });

  it('keeps only the first three unique thread ids', () => {
    expect(selectRecentThreadIds(['a', 'a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });
});
