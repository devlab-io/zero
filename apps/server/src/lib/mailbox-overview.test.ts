import { buildMailboxOverview, getMailboxActivityOrZero } from './mailbox-overview';
import { describe, expect, it } from 'vitest';
import type { DB } from '../db';

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

describe('getMailboxActivityOrZero — activity is a SECONDARY signal (prod fix 2026-08-01)', () => {
  const window = {
    connectionId: 'conn-1',
    todayStart: new Date('2026-08-01T00:00:00Z'),
    weekStart: new Date('2026-07-25T00:00:00Z'),
  };

  it('degrades to ZEROED activity when the aggregate query fails — never throws', async () => {
    const brokenDb = {
      select: () => {
        throw new Error('relation "mail0_send_job" does not exist at https://hyperdrive.local');
      },
    } as unknown as DB;
    await expect(getMailboxActivityOrZero(brokenDb, window)).resolves.toEqual({
      queue: 0,
      processedToday: 0,
      processedWeek: 0,
    });
  });

  it('degraded zeros still build a full overview with EXACT folder counts', async () => {
    const brokenDb = {
      select: () => {
        throw new Error('boom');
      },
    } as unknown as DB;
    const activity = await getMailboxActivityOrZero(brokenDb, window);
    expect(buildMailboxOverview({ inbox: 418, drafts: 7, sent: 1204 }, activity)).toEqual({
      folders: { inbox: 418, drafts: 7, sent: 1204, queue: 0 },
      activity: { processedToday: 0, processedWeek: 0, estimatedMinutesSaved: 0 },
    });
  });
});
