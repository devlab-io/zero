import { describe, expect, it } from 'vitest';

import { getThreadPrefetchIds, THREAD_BODY_PREFETCH_COUNT } from './thread-prefetch';

describe('getThreadPrefetchIds — persistent recent-thread cache contract', () => {
  it('keeps exactly the first 50 unique thread ids in list order', () => {
    const items = Array.from({ length: 60 }, (_, index) => ({ id: `thread-${index}` }));

    const ids = getThreadPrefetchIds(items);

    expect(ids).toHaveLength(THREAD_BODY_PREFETCH_COUNT);
    expect(ids[0]).toBe('thread-0');
    expect(ids.at(-1)).toBe('thread-49');
  });

  it('deduplicates repeated projected rows without consuming the limit twice', () => {
    expect(
      getThreadPrefetchIds([{ id: 'thread-1' }, { id: 'thread-1' }, { id: 'thread-2' }], 2),
    ).toEqual(['thread-1', 'thread-2']);
  });
});
