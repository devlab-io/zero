import {
  draftListRow,
  matchesDraftSearch,
  moveDraftSelection,
  stripDraftHtml,
} from './draft-workspace-model';
import { describe, expect, it } from 'vitest';

describe('draft workspace model', () => {
  it('projects a fast row from the list payload without another fetch', () => {
    expect(
      draftListRow({
        id: 'd1',
        historyId: null,
        $raw: {
          to: [{ name: 'Alice', email: 'alice@example.com' }],
          subject: 'Project update',
          snippet: '<p>Hello <strong>Alice</strong></p>',
          receivedOn: '2026-08-01T08:00:00.000Z',
        },
      }),
    ).toEqual({
      id: 'd1',
      recipient: 'Alice',
      subject: 'Project update',
      preview: 'Hello Alice',
      receivedAt: Date.parse('2026-08-01T08:00:00.000Z'),
    });
  });

  it('strips unsafe markup for the read-only preview', () => {
    expect(stripDraftHtml('<style>x</style><p>Hello<br>world</p><script>bad()</script>')).toBe(
      'Hello\nworld',
    );
  });

  it('searches recipient, subject and preview', () => {
    const row = {
      id: 'd1',
      recipient: 'Alice',
      subject: 'Project update',
      preview: 'Ready for review',
      receivedAt: null,
    };
    expect(matchesDraftSearch(row, 'review')).toBe(true);
    expect(matchesDraftSearch(row, 'bob')).toBe(false);
  });

  it('moves selection with clamped j/k semantics', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveDraftSelection(ids, null, 1)).toBe('a');
    expect(moveDraftSelection(ids, null, -1)).toBe('c');
    expect(moveDraftSelection(ids, 'b', 1)).toBe('c');
    expect(moveDraftSelection(ids, 'c', 1)).toBe('c');
    expect(moveDraftSelection(ids, 'a', -1)).toBe('a');
  });
});
