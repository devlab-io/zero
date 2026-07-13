import { describe, expect, it } from 'vitest';
import { persistSyncedThread } from './gmail-sync-persist';

type Latest = { sender: string };

const makeDeps = () => {
  const putR2: { id: string; full: unknown }[] = [];
  const summaries: { id: string; latest: Latest }[] = [];
  return {
    putR2,
    summaries,
    deps: {
      putR2: async (id: string, full: unknown) => void putR2.push({ id, full }),
      storeSummary: async (id: string, latest: Latest) => void summaries.push({ id, latest }),
    },
  };
};

describe('persistSyncedThread — fidélité pré-slice ThreadSyncWorker', () => {
  it('thread normal (latest présent) → R2 écrit ET résumé DB stocké', async () => {
    const { putR2, summaries, deps } = makeDeps();
    const full = { latest: { sender: 'a@b.co' }, messages: [{}] };
    const outcome = await persistSyncedThread('t1', full, deps);
    expect(outcome).toBe('synced');
    expect(putR2).toEqual([{ id: 't1', full }]);
    expect(summaries).toEqual([{ id: 't1', latest: { sender: 'a@b.co' } }]);
  });

  it('thread 100% brouillons (latest === undefined) → R2 écrit, résumé DB SAUTÉ', async () => {
    const { putR2, summaries, deps } = makeDeps();
    const full = { latest: undefined, messages: [{ isDraft: true }] };
    const outcome = await persistSyncedThread('t2', full, deps);
    expect(outcome).toBe('r2-only');
    expect(putR2).toEqual([{ id: 't2', full }]); // R2 écrit INCONDITIONNELLEMENT
    expect(summaries).toEqual([]); // résumé DB sauté, comme le pré-slice
  });

  it('latest null → traité comme absent (R2 écrit, pas de résumé)', async () => {
    const { putR2, summaries, deps } = makeDeps();
    const full = { latest: null };
    const outcome = await persistSyncedThread('t3', full, deps);
    expect(outcome).toBe('r2-only');
    expect(putR2).toHaveLength(1);
    expect(summaries).toEqual([]);
  });

  it('la persistance R2 précède le résumé DB (ordre)', async () => {
    const order: string[] = [];
    await persistSyncedThread(
      't4',
      { latest: { sender: 'x' } },
      {
        putR2: async () => void order.push('r2'),
        storeSummary: async () => void order.push('db'),
      },
    );
    expect(order).toEqual(['r2', 'db']);
  });
});
