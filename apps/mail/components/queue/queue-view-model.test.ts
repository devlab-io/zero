// @ts-nocheck
import { describe, expect, it } from 'vitest';

import {
  OUTBOX_STATUSES,
  getReviewPendingCount,
  getUndoSecondsRemaining,
  groupOutboxItemsByStatus,
} from './queue-view-model';

const makeItem = (overrides: {
  id: string;
  status: (typeof OUTBOX_STATUSES)[number];
  scheduledSendAt?: Date | null;
}) => ({
  id: overrides.id,
  connectionId: 'conn_1',
  threadId: null,
  mission: null,
  status: overrides.status,
  gmailDraftId: overrides.status === 'draft_ready' ? 'draft_1' : null,
  subject: `Subject ${overrides.id}`,
  body: `Body ${overrides.id}`,
  idempotencyKey: `key_${overrides.id}`,
  scheduledSendAt: overrides.scheduledSendAt ?? null,
  error: null,
  createdAt: new Date('2026-07-06T00:00:00.000Z'),
  updatedAt: new Date('2026-07-06T00:00:00.000Z'),
});

describe('queue view model', () => {
  it('groups items in the outbox status order and counts draft_ready review items', () => {
    const grouped = groupOutboxItemsByStatus([
      makeItem({ id: 'sent-1', status: 'sent' }),
      makeItem({ id: 'ready-1', status: 'draft_ready' }),
      makeItem({ id: 'queued-1', status: 'queued' }),
      makeItem({ id: 'ready-2', status: 'draft_ready' }),
    ]);

    expect(Object.keys(grouped)).toEqual([...OUTBOX_STATUSES]);
    expect(grouped.queued.map((item) => item.id)).toEqual(['queued-1']);
    expect(grouped.draft_ready.map((item) => item.id)).toEqual(['ready-1', 'ready-2']);
    expect(getReviewPendingCount(grouped)).toBe(2);
  });

  it('returns a bounded approval undo countdown', () => {
    const now = new Date('2026-07-06T00:00:00.000Z');
    const item = makeItem({
      id: 'approved-1',
      status: 'approved',
      scheduledSendAt: new Date('2026-07-06T00:00:14.200Z'),
    });

    expect(getUndoSecondsRemaining(item, now)).toBe(15);
    expect(getUndoSecondsRemaining(item, new Date('2026-07-06T00:00:15.000Z'))).toBe(0);
    expect(getUndoSecondsRemaining({ ...item, scheduledSendAt: null }, now)).toBe(0);
  });
});
