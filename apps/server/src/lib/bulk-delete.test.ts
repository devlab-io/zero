import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkDeleteKeys } from './bulk-delete';
import { env } from 'cloudflare:workers';

const workerEnv = env as unknown as {
  gmail_processing_threads: { delete: ReturnType<typeof vi.fn> };
};

describe('bulkDeleteKeys', () => {
  beforeEach(() => {
    workerEnv.gmail_processing_threads = { delete: vi.fn().mockResolvedValue(undefined) };
  });

  it('does not call KV for an empty input', async () => {
    await expect(bulkDeleteKeys([])).resolves.toEqual({ successful: 0, failed: 0 });
    expect(workerEnv.gmail_processing_threads.delete).not.toHaveBeenCalled();
  });

  it('deletes each unique key through the bound namespace', async () => {
    await expect(bulkDeleteKeys(['thread-1', 'thread-2', 'thread-1'])).resolves.toEqual({
      successful: 2,
      failed: 0,
    });
    expect(workerEnv.gmail_processing_threads.delete.mock.calls).toEqual([
      ['thread-1'],
      ['thread-2'],
    ]);
  });

  it('reports individual failures without rejecting the batch', async () => {
    workerEnv.gmail_processing_threads.delete.mockImplementation(async (key: string) => {
      if (key === 'thread-2') throw new Error('KV unavailable');
    });

    await expect(bulkDeleteKeys(['thread-1', 'thread-2', 'thread-3'])).resolves.toEqual({
      successful: 2,
      failed: 1,
    });
  });
});
