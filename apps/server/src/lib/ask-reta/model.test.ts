import { describe, expect, it, vi } from 'vitest';
import { AskRetaAbortedError } from './errors';
import { workersAiModel } from './model';

const params = { system: 's', user: 'u', maxTokens: 100, temperature: 0.1 };

describe('workersAiModel — COOPERATIVE cancellation, honestly typed', () => {
  it('declares abortMode cooperative (env.AI.run has no abort API)', () => {
    const model = workersAiModel(
      { run: vi.fn() },
      { key: 'workers-ai:llama-4-scout', upstreamModel: '@cf/meta/llama-4-scout-17b-16e-instruct' },
    );
    expect(model.abortMode).toBe('cooperative');
  });

  it('refuses to DISPATCH after abort: ai.run is never called', async () => {
    const run = vi.fn(async () => ({ response: 'x' }));
    const model = workersAiModel(
      { run },
      { key: 'workers-ai:llama-4-scout', upstreamModel: '@cf/meta/llama-4-scout-17b-16e-instruct' },
    );
    const controller = new AbortController();
    controller.abort();
    await expect(model.complete({ ...params, signal: controller.signal })).rejects.toBeInstanceOf(
      AskRetaAbortedError,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('DISCARDS a late inference result when the abort happened during the await', async () => {
    const controller = new AbortController();
    let release!: (value: { response: string }) => void;
    const run = vi.fn(() => new Promise<{ response: string }>((resolve) => (release = resolve)));
    const model = workersAiModel(
      { run },
      { key: 'workers-ai:llama-4-scout', upstreamModel: '@cf/meta/llama-4-scout-17b-16e-instruct' },
    );
    const pending = model.complete({ ...params, signal: controller.signal });
    controller.abort();
    // The dispatched inference "completes" on the provider side — its output
    // is discarded, never returned.
    release({ response: 'réponse tardive du GPU' });
    await expect(pending).rejects.toBeInstanceOf(AskRetaAbortedError);
  });

  it('returns the inference text on the normal path', async () => {
    const model = workersAiModel(
      { run: vi.fn(async () => ({ response: 'ok' })) },
      { key: 'workers-ai:llama-4-scout', upstreamModel: '@cf/meta/llama-4-scout-17b-16e-instruct' },
    );
    await expect(model.complete(params)).resolves.toBe('ok');
  });
});
