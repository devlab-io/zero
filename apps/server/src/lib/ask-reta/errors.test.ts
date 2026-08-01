import { AskRetaAbortedError, guardWithSignal } from './errors';
import { describe, expect, it, vi } from 'vitest';

describe('guardWithSignal — cooperative discipline for non-abortable dependencies', () => {
  it('REFUSES to dispatch after abort: the dependency is never called', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn(async () => 'value');
    await expect(guardWithSignal(controller.signal, run)).rejects.toBeInstanceOf(
      AskRetaAbortedError,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('DISCARDS a late result when the abort happened mid-flight', async () => {
    const controller = new AbortController();
    let release!: (value: string) => void;
    const run = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const guarded = guardWithSignal(controller.signal, run);
    controller.abort();
    release('résultat tardif à jeter');
    await expect(guarded).rejects.toBeInstanceOf(AskRetaAbortedError);
  });

  it('passes the value through when no abort occurred', async () => {
    await expect(guardWithSignal(undefined, async () => 42)).resolves.toBe(42);
    const controller = new AbortController();
    await expect(guardWithSignal(controller.signal, async () => 'ok')).resolves.toBe('ok');
  });
});
