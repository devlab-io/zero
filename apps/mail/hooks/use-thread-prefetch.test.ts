import {
  prefetchThreadIdsInBatches,
  resolveActiveThreadIndex,
  selectAdjacentThreadIds,
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

  it('resolves the active index by id first, then by focused-row hint', () => {
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], 'b', null)).toBe(1);
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], 'missing', 2)).toBe(2);
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], 'missing', 5)).toBe(-1);
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], null, 1)).toBe(-1);
  });

  it('warms the two next threads and the previous one around the reader', () => {
    expect(selectAdjacentThreadIds(['a', 'b', 'c', 'd', 'e'], 'c')).toEqual(['d', 'e', 'b']);
    expect(selectAdjacentThreadIds(['a', 'b', 'c', 'd'], 'message-id', 2)).toEqual(['d', 'b']);
  });

  it('adjacent selection degrades cleanly at both list boundaries', () => {
    expect(selectAdjacentThreadIds(['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
    expect(selectAdjacentThreadIds(['a', 'b', 'c'], 'c')).toEqual(['b']);
    expect(selectAdjacentThreadIds(['only'], 'only')).toEqual([]);
    expect(selectAdjacentThreadIds(['a', 'b'], 'missing')).toEqual([]);
  });

  it('never duplicates between the next and previous windows', () => {
    expect(selectAdjacentThreadIds(['x', 'b', 'y', 'b', 'c'], 'missing', 2)).toEqual(['b', 'c']);
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

  it('limits visible body reads to batches of two', async () => {
    let active = 0;
    let maxActive = 0;
    const completed = await prefetchThreadIdsInBatches(
      ['a', 'b', 'c', 'd', 'e'],
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 0));
        active -= 1;
      },
      () => true,
    );

    expect(completed).toBe(true);
    expect(maxActive).toBe(2);
  });

  it('stops speculative batches when list pagination takes priority', async () => {
    const prefetched: string[] = [];
    let checks = 0;
    const completed = await prefetchThreadIdsInBatches(
      ['a', 'b', 'c', 'd'],
      async (id) => {
        prefetched.push(id);
      },
      () => checks++ === 0,
    );

    expect(completed).toBe(false);
    expect(prefetched).toEqual(['a', 'b']);
  });
});
