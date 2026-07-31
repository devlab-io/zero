import {
  planVisibleThreadPrefetch,
  prefetchThreadIdsInBatches,
  resolveActiveThreadIndex,
  runClickPrefetchPlan,
  selectAdjacentThreadIds,
  selectInitialThreadIds,
  selectNextThreadIds,
  selectVisibleThreadIds,
  shouldPrefetchThreadBodies,
} from './use-thread-prefetch';
import { describe, expect, it, vi } from 'vitest';

describe('targeted thread prefetch', () => {
  it('does not prefetch on data saver or 2g', () => {
    expect(shouldPrefetchThreadBodies({ saveData: true })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '2g' })).toBe(false);
    expect(shouldPrefetchThreadBodies({ effectiveType: '4g' })).toBe(true);
  });

  it('warms only the first three unique list rows on a cold inbox', () => {
    expect(selectInitialThreadIds(['a', 'b', 'a', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(selectInitialThreadIds([])).toEqual([]);
  });

  it('selects only the two unique threads after the active one', () => {
    expect(selectNextThreadIds(['a', 'b', 'b', 'c', 'd'], 'a')).toEqual(['b', 'c']);
    expect(selectNextThreadIds(['a', 'b', 'c', 'd'], 'b')).toEqual(['c', 'd']);
  });

  it('does nothing when the active thread is absent or already last', () => {
    expect(selectNextThreadIds(['a', 'b'], 'missing')).toEqual([]);
    expect(selectNextThreadIds(['a', 'b'], 'b')).toEqual([]);
    expect(selectNextThreadIds(['a', 'b'], null)).toEqual([]);
  });

  it('uses the focused row when the open thread uses another projection id', () => {
    expect(selectNextThreadIds(['a', 'b', 'c', 'd'], 'message-id', 1)).toEqual(['c', 'd']);
  });

  it('resolves the active index by id first, then by focused-row hint', () => {
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], 'b', null)).toBe(1);
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], 'missing', 2)).toBe(2);
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], 'missing', 5)).toBe(-1);
    expect(resolveActiveThreadIndex(['a', 'b', 'c'], null, 1)).toBe(-1);
  });

  it('warms the two next threads and the previous one around the reader', () => {
    expect(selectAdjacentThreadIds(['a', 'b', 'c', 'd', 'e'], 'c')).toEqual(['d', 'e', 'b']);
    expect(selectAdjacentThreadIds(['a', 'b', 'c', 'd'], 'message-id', 2)).toEqual(['d', 'b']);
  });

  it('adjacent selection degrades cleanly at both list boundaries', () => {
    expect(selectAdjacentThreadIds(['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
    expect(selectAdjacentThreadIds(['a', 'b', 'c'], 'c')).toEqual(['b']);
    expect(selectAdjacentThreadIds(['only'], 'only')).toEqual([]);
    expect(selectAdjacentThreadIds(['a', 'b'], 'missing')).toEqual([]);
  });

  it('never duplicates between the next and previous windows', () => {
    expect(selectAdjacentThreadIds(['x', 'b', 'y', 'b', 'c'], 'missing', 2)).toEqual(['b', 'c']);
  });

  it('warms the full visible window and the next two rows after a scroll', () => {
    expect(selectVisibleThreadIds(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 2, 4)).toEqual([
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
    // Overscan clamps to the loaded end of the list.
    expect(selectVisibleThreadIds(['a', 'b', 'c', 'd'], 2, 4)).toEqual(['c', 'd']);
  });

  it('clamps stale virtual ranges and removes duplicate thread ids', () => {
    expect(selectVisibleThreadIds(['a', 'a', 'b', 'c'], -2, 1)).toEqual(['a', 'b', 'c']);
    expect(selectVisibleThreadIds(['a', 'b'], 5, 7)).toEqual([]);
    expect(selectVisibleThreadIds([], 0, 0)).toEqual([]);
  });

  it('plans visible+overscan warming once per range: same range → skip, no redundant queue', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const first = planVisibleThreadPrefetch(ids, 0, 2, '');
    expect(first.skip).toBe(false);
    expect(first.ids).toEqual(['a', 'b', 'c', 'd', 'e']);

    // Même plage re-signalée (scroll immobile, re-render) : AUCUNE nouvelle
    // file de requêtes tant que la clé achevée n'a pas changé.
    const repeat = planVisibleThreadPrefetch(ids, 0, 2, first.key);
    expect(repeat.skip).toBe(true);

    // La plage bouge d'une ligne → nouvelle clé, nouveau réchauffage.
    const moved = planVisibleThreadPrefetch(ids, 1, 3, first.key);
    expect(moved.skip).toBe(false);
    expect(moved.ids).toEqual(['b', 'c', 'd', 'e', 'f']);
  });

  it('plans nothing for an empty or unresolved virtual range', () => {
    expect(planVisibleThreadPrefetch([], 0, 0, '').skip).toBe(true);
    expect(planVisibleThreadPrefetch(['a'], 5, 7, '').skip).toBe(true);
  });

  it('limits visible body reads to batches of two', async () => {
    let active = 0;
    let maxActive = 0;
    const completed = await prefetchThreadIdsInBatches(
      ['a', 'b', 'c', 'd', 'e'],
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 0));
        active -= 1;
      },
      () => true,
    );

    expect(completed).toBe(true);
    expect(maxActive).toBe(2);
  });

  it('stops speculative batches when list pagination takes priority', async () => {
    const prefetched: string[] = [];
    let checks = 0;
    const completed = await prefetchThreadIdsInBatches(
      ['a', 'b', 'c', 'd'],
      async (id) => {
        prefetched.push(id);
      },
      () => checks++ === 0,
    );

    expect(completed).toBe(false);
    expect(prefetched).toEqual(['a', 'b']);
  });
});

// r15a : au clic, le fil ouvert passe DEVANT toute spéculation — la file
// visible est annulée avant le moindre départ, le courant part seul, les deux
// suivants attendent sa résolution (ils chauffent pendant la lecture, pas en
// concurrence avec l'ouverture).
describe('runClickPrefetchPlan — priorité au fil cliqué', () => {
  it('annule la file spéculative SYNCHRONEMENT, avant le moindre prefetch', () => {
    const order: string[] = [];
    void runClickPrefetchPlan({
      currentId: 'current',
      nextIds: ['n1', 'n2'],
      prefetch: (id) => {
        order.push(`prefetch:${id}`);
        return new Promise(() => {});
      },
      cancelSpeculative: () => order.push('cancel'),
    });

    // Aucun await nécessaire : l'annulation ET le départ du courant sont
    // synchrones dans le handler de clic ; rien d'autre n'est parti.
    expect(order).toEqual(['cancel', 'prefetch:current']);
  });

  it('ne lance les deux suivants qu’APRÈS la résolution du courant', async () => {
    const order: string[] = [];
    let resolveCurrent = () => {};
    const plan = runClickPrefetchPlan({
      currentId: 'current',
      nextIds: ['n1', 'n2'],
      prefetch: (id) => {
        order.push(id);
        if (id === 'current') {
          return new Promise<void>((resolve) => {
            resolveCurrent = resolve;
          });
        }
        return Promise.resolve();
      },
      cancelSpeculative: vi.fn(),
    });

    // Le courant est en vol : les suivants ne sont PAS partis.
    await Promise.resolve();
    expect(order).toEqual(['current']);

    resolveCurrent();
    await plan;
    expect(order).toEqual(['current', 'n1', 'n2']);
  });

  it('chauffe quand même les suivants si le courant échoue (le useQuery lecteur couvre)', async () => {
    const order: string[] = [];
    await runClickPrefetchPlan({
      currentId: 'current',
      nextIds: ['n1', 'n2'],
      prefetch: (id) => {
        order.push(id);
        return id === 'current' ? Promise.reject(new Error('offline')) : Promise.resolve();
      },
      cancelSpeculative: vi.fn(),
    });

    expect(order).toEqual(['current', 'n1', 'n2']);
  });

  it('un échec d’un suivant ne rejette jamais le plan', async () => {
    await expect(
      runClickPrefetchPlan({
        currentId: 'current',
        nextIds: ['n1'],
        prefetch: (id) =>
          id === 'n1' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
        cancelSpeculative: vi.fn(),
      }),
    ).resolves.toBeUndefined();
  });
});
