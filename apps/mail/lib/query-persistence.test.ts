import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { shouldPersistQuery } from '@/providers/query-provider';

const queryFor = (
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  meta?: Record<string, unknown>,
) => {
  queryClient.setQueryData(queryKey, { ok: true });
  const query = queryClient.getQueryCache().find({ queryKey, exact: true });
  if (!query) throw new Error('query was not created');
  query.setOptions({ ...query.options, meta });
  return query;
};

describe('query persistence policy', () => {
  it('persists successful thread-list projections', () => {
    const queryClient = new QueryClient();
    const query = queryFor(queryClient, [['mail', 'listThreads'], { type: 'infinite' }]);

    expect(shouldPersistQuery(query)).toBe(true);
  });

  it('persists explicitly opted-in warmed thread bodies', () => {
    const queryClient = new QueryClient();
    const query = queryFor(
      queryClient,
      [['mail', 'get'], { input: { id: 'thread-1' }, type: 'query' }],
      { persist: true },
    );

    expect(shouldPersistQuery(query)).toBe(true);
  });

  it('does not persist unrelated successful queries', () => {
    const queryClient = new QueryClient();
    const query = queryFor(queryClient, [
      ['mail', 'getMessageAttachments'],
      { input: { messageId: 'message-1' }, type: 'query' },
    ]);

    expect(shouldPersistQuery(query)).toBe(false);
  });
});
