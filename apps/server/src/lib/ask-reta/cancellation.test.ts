import { createAskRetaCancellation } from './cancellation';
import { describe, expect, it, vi } from 'vitest';

describe('createAskRetaCancellation — one owned authority per run', () => {
  it('the DEADLINE aborts the signal: the underlying dependency settles at deadline', async () => {
    vi.useFakeTimers();
    try {
      const cancellation = createAskRetaCancellation({ deadlineMs: 45_000 });
      // A hanging dependency that only settles when ITS signal aborts.
      let settled = false;
      const dependency = new Promise<void>((resolve) => {
        cancellation.signal.addEventListener('abort', () => {
          settled = true;
          resolve();
        });
      });
      await vi.advanceTimersByTimeAsync(44_999);
      expect(cancellation.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await dependency;
      expect(settled).toBe(true);
      cancellation.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows the request signal, including an already-aborted one', () => {
    const source = new AbortController();
    const live = createAskRetaCancellation({ requestSignal: source.signal });
    expect(live.signal.aborted).toBe(false);
    source.abort();
    expect(live.signal.aborted).toBe(true);
    live.dispose();

    const aborted = new AbortController();
    aborted.abort();
    const dead = createAskRetaCancellation({ requestSignal: aborted.signal });
    expect(dead.signal.aborted).toBe(true);
    dead.dispose();
  });

  it('dispose detaches everything: a later source abort no longer propagates', () => {
    vi.useFakeTimers();
    try {
      const source = new AbortController();
      const cancellation = createAskRetaCancellation({ requestSignal: source.signal });
      cancellation.dispose();
      cancellation.dispose(); // idempotent
      source.abort();
      expect(cancellation.signal.aborted).toBe(false);
      // The deadline timer is cleared too: no late abort.
      vi.advanceTimersByTime(120_000);
      expect(cancellation.signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abort() stays available after dispose (explicit late abort by the owner)', () => {
    const cancellation = createAskRetaCancellation({});
    cancellation.dispose();
    cancellation.abort();
    expect(cancellation.signal.aborted).toBe(true);
  });
});
