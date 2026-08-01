import { resolveThreadAcrossShards } from './thread-shard-resolution';
import { describe, expect, it, vi } from 'vitest';

const delayed = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

describe('resolveThreadAcrossShards — the owner wins, never a fast miss', () => {
  it('a FAST miss (null) does not beat the SLOW owning shard', async () => {
    const resolved = await resolveThreadAcrossShards([
      { shardId: 'shard-miss', read: () => delayed(null, 1) },
      { shardId: 'shard-owner', read: () => delayed({ messages: ['m1'] }, 30) },
    ]);
    expect(resolved).toEqual({ result: { messages: ['m1'] }, shardId: 'shard-owner' });
  });

  it('absent on EVERY shard resolves null (never a truthy empty object)', async () => {
    const resolved = await resolveThreadAcrossShards([
      { shardId: 's1', read: () => delayed(null, 1) },
      { shardId: 's2', read: () => delayed(undefined as never, 5) },
    ]);
    expect(resolved).toBeNull();
  });

  it('a shard error counts as a miss and is reported, not a winner', async () => {
    const onError = vi.fn();
    const resolved = await resolveThreadAcrossShards(
      [
        { shardId: 'broken', read: () => Promise.reject(new Error('rpc down')) },
        { shardId: 'owner', read: () => delayed({ ok: true }, 10) },
      ],
      onError,
    );
    expect(resolved).toEqual({ result: { ok: true }, shardId: 'owner' });
    expect(onError).toHaveBeenCalledWith('broken', expect.any(Error));
  });

  it('all shards erroring resolves null', async () => {
    const resolved = await resolveThreadAcrossShards([
      { shardId: 's1', read: () => Promise.reject(new Error('a')) },
      { shardId: 's2', read: () => Promise.reject(new Error('b')) },
    ]);
    expect(resolved).toBeNull();
  });

  it('the FIRST owner to answer wins when several shards return data', async () => {
    const resolved = await resolveThreadAcrossShards([
      { shardId: 'slow-owner', read: () => delayed({ from: 'slow' }, 40) },
      { shardId: 'fast-owner', read: () => delayed({ from: 'fast' }, 5) },
    ]);
    expect(resolved?.shardId).toBe('fast-owner');
  });

  it('no shards → null', async () => {
    expect(await resolveThreadAcrossShards([])).toBeNull();
  });
});
