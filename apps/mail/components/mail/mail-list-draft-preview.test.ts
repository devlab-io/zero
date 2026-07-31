import { selectDraftRowPreview } from './mail-list-draft-preview';
import { describe, expect, it } from 'vitest';

describe('selectDraftRowPreview', () => {
  it('reuses the full metadata already returned by listDrafts', () => {
    expect(
      selectDraftRowPreview({
        id: 'd1',
        historyId: null,
        $raw: {
          subject: 'Ready now',
          receivedOn: '2026-07-31T00:00:00.000Z',
          to: [{ name: 'Alice', email: 'alice@example.com' }],
        },
      }),
    ).toEqual({
      recipient: 'Alice',
      subject: 'Ready now',
      receivedAt: Date.parse('2026-07-31T00:00:00.000Z'),
    });
  });

  it('supports string recipients and Gmail internal dates', () => {
    expect(
      selectDraftRowPreview({
        id: 'd2',
        historyId: null,
        $raw: {
          subject: 'Fallback',
          rawMessage: { internalDate: '1785456000000' },
          to: ['Bob <bob@example.com>'],
        },
      }),
    ).toEqual({
      recipient: 'Bob <bob@example.com>',
      subject: 'Fallback',
      receivedAt: 1785456000000,
    });
  });

  it('falls back to drafts.get only when list metadata is absent', () => {
    expect(selectDraftRowPreview({ id: 'd3', historyId: null })).toBeNull();
  });
});
