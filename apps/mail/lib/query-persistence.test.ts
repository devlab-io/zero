import {
  selectQueriesForPersistence,
  shouldPersistQuery,
  type PersistableQuery,
} from './query-persistence';
import { describe, expect, it } from 'vitest';

function query(
  queryKey: readonly unknown[],
  data: unknown,
  dataUpdatedAt = 1,
  status = 'success',
): PersistableQuery {
  return { queryKey, state: { data, dataUpdatedAt, status } };
}

describe('query persistence policy', () => {
  it('persists successful lists and bounded thread details', () => {
    expect(shouldPersistQuery(query([['mail', 'listThreads']], { pages: [] }))).toBe(true);
    expect(shouldPersistQuery(query([['mail', 'get']], { id: 'thread-1' }))).toBe(true);
    expect(shouldPersistQuery(query(['email-content', 'message-1'], '<p>Hello</p>'))).toBe(true);
  });

  it('does not persist attachments, failed queries, or oversized details', () => {
    expect(
      shouldPersistQuery(query([['mail', 'getMessageAttachments']], [{ name: 'invoice.pdf' }])),
    ).toBe(false);
    expect(shouldPersistQuery(query([['mail', 'get']], null, 1, 'error'))).toBe(false);
    expect(shouldPersistQuery(query([['mail', 'get']], 'x'.repeat(3 * 1024 * 1024 + 1)))).toBe(
      false,
    );
  });

  it('keeps the newest detail queries inside the aggregate budget', () => {
    const details = Array.from({ length: 5 }, (_, index) =>
      query(
        [['mail', 'get'], { input: { id: `thread-${index}` } }],
        'x'.repeat(2 * 1024 * 1024),
        index,
      ),
    );

    const selected = selectQueriesForPersistence(details);

    expect(selected).toHaveLength(3);
    expect(selected.map((item) => item.state.dataUpdatedAt)).toEqual([4, 3, 2]);
  });
});
