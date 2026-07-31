import { prefetchThreadIdsInBatches, selectVisibleThreadIds } from '@/hooks/use-thread-prefetch';
import { shouldLoadNextMailPage } from './mail-pagination';
import { describe, expect, it } from 'vitest';

/**
 * Contrat d'intégration de mail-list (parité r3) : une page qui atterrit ne
 * produit pas d'événement scroll — le re-contrôle post-append doit chaîner la
 * page suivante quand la réserve est courte, puis, une fois la réserve
 * suffisante, réchauffer les corps des lignes nouvellement révélées, dans
 * l'ordre et UN vol à la fois (r15b : l'abort serveur n'étant pas garanti, la
 * contention résiduelle au clic est bornée à une seule requête spéculative).
 */
describe('append → re-check → prefetch of the newly revealed rows', () => {
  const pageOf = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => `t${start + i}`);

  it('chains the next page while the reserve is short, then warms the new ids', async () => {
    // Page 1 loaded (20 rows), viewport sits at the bottom (endIndex 19).
    let ids = pageOf(0, 20);
    const endIndex = 19;

    // Re-check after the append of page 1: reserve is 0 → chain loadMore.
    expect(
      shouldLoadNextMailPage({
        remainingItems: Math.max(0, ids.length - 1 - endIndex),
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);

    // While page 2 is in flight, both pagination and body warming stand down.
    expect(
      shouldLoadNextMailPage({
        remainingItems: 0,
        isLoading: false,
        isFetchingNextPage: true,
        hasNextPage: true,
      }),
    ).toBe(false);
    const cancelled = await prefetchThreadIdsInBatches(
      selectVisibleThreadIds(ids, 15, endIndex),
      async () => undefined,
      () => false,
    );
    expect(cancelled).toBe(false);

    // Page 2 lands (40 rows): reserve is now a full page → no further chain.
    ids = [...ids, ...pageOf(20, 20)];
    expect(
      shouldLoadNextMailPage({
        remainingItems: Math.max(0, ids.length - 1 - endIndex),
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(false);

    // The same re-check now warms the viewport plus the two revealed rows of
    // page 2, in list order, at most ONE body in flight (r15b).
    const visible = selectVisibleThreadIds(ids, 15, endIndex);
    expect(visible).toEqual(['t15', 't16', 't17', 't18', 't19', 't20', 't21']);

    const prefetched: string[] = [];
    let active = 0;
    let maxActive = 0;
    const completed = await prefetchThreadIdsInBatches(
      visible,
      async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 0));
        prefetched.push(id);
        active -= 1;
      },
      () => true,
    );

    expect(completed).toBe(true);
    expect(prefetched).toEqual(visible);
    expect(maxActive).toBe(1);
  });
});
