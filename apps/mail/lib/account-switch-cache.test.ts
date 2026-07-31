import {
  InfiniteQueryObserver,
  QueryClient,
  QueryObserver,
  type InfiniteData,
} from '@tanstack/react-query';
import { refreshActiveQueriesAfterAccountSwitch } from './account-switch-cache';
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

  it("purge les lectures INACTIVES de l'ancien compte (refetchOnMount:false ne les aurait jamais rafraîchies)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    let account = 'admin';

    const activeOptions = {
      queryKey: ['mail', 'listThreads', 'inbox'] as const,
      queryFn: async () => [`${account}-inbox`],
      staleTime: Infinity,
    };
    // Dossier visité puis quitté : plus aucun observateur — c'est la lecture
    // qui rendait les données croisées après switch.
    await queryClient.fetchQuery({
      queryKey: ['mail', 'listThreads', 'archive'] as const,
      queryFn: async () => [`${account}-archive`],
      staleTime: Infinity,
    });
    await queryClient.fetchQuery(activeOptions);
    observers.push(new QueryObserver(queryClient, activeOptions).subscribe(() => undefined));

    account = 'thomas';
    await refreshActiveQueriesAfterAccountSwitch(queryClient);

    // L'entrée inactive de l'ancien compte a disparu ; l'active est refetchée.
    expect(queryClient.getQueryData(['mail', 'listThreads', 'archive'])).toBeUndefined();
    expect(queryClient.getQueryData(activeOptions.queryKey)).toEqual(['thomas-inbox']);
  });

  it('refetches only the first loaded page after a deeply scrolled account switch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const calls: unknown[] = [];
    const queryKey = [
      ['mail', 'listThreads'],
      { input: { folder: 'inbox' }, type: 'infinite' },
    ] as const;
    const options = {
      queryKey,
      queryFn: async ({ pageParam }: { pageParam: unknown }) => {
        calls.push(pageParam);
        return { account: 'thomas', page: pageParam };
      },
      initialPageParam: 'page-1',
      getNextPageParam: () => undefined,
      staleTime: Infinity,
    };

    queryClient.setQueryData<InfiniteData<{ account: string; page: string }, string>>(queryKey, {
      pages: [
        { account: 'admin', page: 'page-1' },
        { account: 'admin', page: 'page-2' },
        { account: 'admin', page: 'page-3' },
      ],
      pageParams: ['page-1', 'page-2', 'page-3'],
    });
    observers.push(new InfiniteQueryObserver(queryClient, options).subscribe(() => undefined));

    await refreshActiveQueriesAfterAccountSwitch(queryClient, {
      infiniteQueryKey: [['mail', 'listThreads']],
    });

    expect(calls).toEqual(['page-1']);
    expect(
      queryClient.getQueryData<InfiniteData<{ account: string; page: string }>>(queryKey),
    ).toMatchObject({ pages: [{ account: 'thomas', page: 'page-1' }] });
  });
});
