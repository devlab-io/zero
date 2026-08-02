import { adjustMailboxDraftCount } from './mailbox-counts';
import { describe, expect, it } from 'vitest';

describe('adjustMailboxDraftCount', () => {
  it('updates the cached provider total without changing the other counters', () => {
    expect(
      adjustMailboxDraftCount(
        { folders: { inbox: 163, drafts: 527, sent: 5_496 }, activity: { processedToday: 0 } },
        -20,
      ),
    ).toEqual({
      folders: { inbox: 163, drafts: 507, sent: 5_496 },
      activity: { processedToday: 0 },
    });
  });

  it('never exposes a negative count and leaves unknown cache data untouched', () => {
    expect(adjustMailboxDraftCount({ folders: { drafts: 2 } }, -20)).toEqual({
      folders: { drafts: 0 },
    });
    expect(adjustMailboxDraftCount(undefined, -1)).toBeUndefined();
  });
});
