import { describe, expect, it } from 'vitest';
import { successorAfterThread } from './thread-display';

describe('thread triage successor', () => {
  it.each([1, 2, 20])('selects by identity without skips for %i threads', (count) => {
    const items = Array.from({ length: count }, (_, index) => ({ id: `thread-${index}` }));
    for (let index = 0; index < count; index++) {
      expect(successorAfterThread(items, `thread-${index}`)?.id ?? null).toBe(
        index + 1 < count ? `thread-${index + 1}` : null,
      );
    }
  });
});
