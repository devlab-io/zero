import { describe, expect, it } from 'vitest';

import { drainPrefetchQueue } from './prefetch-queue';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('drainPrefetchQueue — bounded-concurrency cache warmer', () => {
  it('processes every id exactly once', async () => {
    const seen: string[] = [];
    const count = await drainPrefetchQueue(
      ['a', 'b', 'c', 'd', 'e'],
      async (id) => {
        seen.push(id);
      },
      3,
      () => false,
    );
    expect(count).toBe(5);
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('never exceeds the concurrency bound', async () => {
    let inFlight = 0;
    let peak = 0;
    await drainPrefetchQueue(
      Array.from({ length: 20 }, (_, i) => `t${i}`),
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight -= 1;
      },
      3,
      () => false,
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('stops promptly once cancelled', async () => {
    let cancelled = false;
    let fetched = 0;
    const count = await drainPrefetchQueue(
      Array.from({ length: 50 }, (_, i) => `t${i}`),
      async () => {
        fetched += 1;
        await tick();
        if (fetched >= 4) cancelled = true;
      },
      2,
      () => cancelled,
    );
    expect(count).toBeLessThan(50);
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('tolerates a zero/negative concurrency by clamping to one worker', async () => {
    const seen: string[] = [];
    await drainPrefetchQueue(
      ['a', 'b'],
      async (id) => {
        seen.push(id);
      },
      0,
      () => false,
    );
    expect(seen).toEqual(['a', 'b']);
  });

  it('resolves immediately on an empty queue', async () => {
    const count = await drainPrefetchQueue(
      [],
      async () => {},
      3,
      () => false,
    );
    expect(count).toBe(0);
  });
});
