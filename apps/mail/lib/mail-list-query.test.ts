import { MAIL_LIST_QUERY_BEHAVIOR, MAIL_LIST_STALE_MS } from './mail-list-query';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

// Preuve du contrat « snapshot d'abord, réconciliation stale-only » avec les
// VRAIES valeurs expédiées (MAIL_LIST_QUERY_BEHAVIOR), contre un vrai
// QueryClient : entrer dans un dossier dont le snapshot a 6 min peint le cache
// immédiatement puis lance UNE seule réconciliation d'arrière-plan ; un
// dossier frais (< staleTime) ne déclenche AUCUNE requête.

const KEY = [['mail', 'listThreads'], { input: { folder: 'inbox' }, type: 'infinite' }];

const page = (id: string) => ({ threads: [{ id }], nextPageToken: null });

const makeObserver = (queryClient: QueryClient, queryFn: () => Promise<unknown>) =>
  new InfiniteQueryObserver(queryClient, {
    queryKey: KEY,
    queryFn,
    initialPageParam: '',
    getNextPageParam: () => null,
    ...MAIL_LIST_QUERY_BEHAVIOR,
  });

describe('MAIL_LIST_QUERY_BEHAVIOR — snapshot puis réconciliation stale-only', () => {
  it('entrée à 6 min : snapshot peint immédiatement, puis UNE seule réconciliation background', async () => {
    const queryClient = new QueryClient();
    const queryFn = vi.fn(async () => page('fresh-row'));
    queryClient.setQueryData(
      KEY,
      { pages: [page('snapshot-row')], pageParams: [''] },
      { updatedAt: Date.now() - (MAIL_LIST_STALE_MS + 60 * 1000) }, // 6 min
    );

    const observer = makeObserver(queryClient, queryFn);

    // Avant tout réseau : le snapshot local est déjà la donnée rendue.
    const immediate = observer.getCurrentResult();
    expect(
      (immediate.data as { pages: Array<{ threads: Array<{ id: string }> }> }).pages[0]?.threads[0]
        ?.id,
    ).toBe('snapshot-row');

    const unsubscribe = observer.subscribe(() => {});
    // Les rows restent affichées PENDANT le vol de réconciliation.
    expect(observer.getCurrentResult().data).toBeDefined();
    expect(observer.getCurrentResult().isFetching).toBe(true);

    await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false));
    // UNE seule réconciliation — pas de tempête de refetch.
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(
      (observer.getCurrentResult().data as { pages: Array<{ threads: Array<{ id: string }> }> })
        .pages[0]?.threads[0]?.id,
    ).toBe('fresh-row');
    unsubscribe();
  });

  it('entrée sur un dossier frais (< staleTime) : zéro requête, le snapshot suffit', async () => {
    const queryClient = new QueryClient();
    const queryFn = vi.fn(async () => page('never'));
    queryClient.setQueryData(
      KEY,
      { pages: [page('warm-row')], pageParams: [''] },
      { updatedAt: Date.now() - 60 * 1000 }, // 1 min
    );

    const observer = makeObserver(queryClient, queryFn);
    const unsubscribe = observer.subscribe(() => {});

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queryFn).not.toHaveBeenCalled();
    expect(
      (observer.getCurrentResult().data as { pages: Array<{ threads: Array<{ id: string }> }> })
        .pages[0]?.threads[0]?.id,
    ).toBe('warm-row');
    unsubscribe();
  });
});
