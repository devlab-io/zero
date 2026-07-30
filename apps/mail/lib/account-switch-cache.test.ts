import { refreshActiveQueriesAfterAccountSwitch } from './account-switch-cache';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';

const observers: Array<() => void> = [];

afterEach(() => {
  for (const unsubscribe of observers.splice(0)) unsubscribe();
});

describe('refreshActiveQueriesAfterAccountSwitch', () => {
  it('keeps mounted queries observable and replaces the previous account data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    let account = 'admin';

    const activeConnectionOptions = {
      queryKey: ['connections', 'getDefault'] as const,
      queryFn: async () => ({ id: account, email: `${account}@devlab.io` }),
      staleTime: Infinity,
    };
    const inboxOptions = {
      queryKey: ['mail', 'listThreads', 'inbox'] as const,
      queryFn: async () => [`${account}-message`],
      staleTime: Infinity,
    };

    await Promise.all([
      queryClient.fetchQuery(activeConnectionOptions),
      queryClient.fetchQuery(inboxOptions),
    ]);

    observers.push(
      new QueryObserver(queryClient, activeConnectionOptions).subscribe(() => undefined),
      new QueryObserver(queryClient, inboxOptions).subscribe(() => undefined),
    );

    account = 'thomas';
    await refreshActiveQueriesAfterAccountSwitch(queryClient);

    expect(queryClient.getQueryData(activeConnectionOptions.queryKey)).toEqual({
      id: 'thomas',
      email: 'thomas@devlab.io',
    });
    expect(queryClient.getQueryData(inboxOptions.queryKey)).toEqual(['thomas-message']);
    expect(queryClient.getQueryCache().findAll()).toHaveLength(2);
  });
});
