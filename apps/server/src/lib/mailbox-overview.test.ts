import { buildMailboxOverview } from './mailbox-overview';
import { describe, expect, it } from 'vitest';

describe('buildMailboxOverview', () => {
  it('keeps exact provider totals and derives the explicit weekly estimate', () => {
    expect(
      buildMailboxOverview(
        { inbox: 418, drafts: 7, sent: 1204 },
        { queue: 3, processedToday: 4, processedWeek: 18 },
      ),
    ).toEqual({
      folders: { inbox: 418, drafts: 7, sent: 1204, queue: 3 },
      activity: { processedToday: 4, processedWeek: 18, estimatedMinutesSaved: 36 },
    });
  });
});
