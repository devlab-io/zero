import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runSendJobSweep } from './sweep';

const NOW = new Date('2026-07-31T12:00:00Z');

const dueJobs: Array<{ id: string; connectionId: string; scheduledSendAt: Date | null }> = [];
const ops = {
  sweepDueSendJobs: vi.fn(async () => dueJobs),
  clearSendJobEnqueueMark: vi.fn(async () => ({ id: 'x' })),
};
const queue = { send: vi.fn(async () => {}) };

beforeEach(() => {
  vi.clearAllMocks();
  dueJobs.length = 0;
});

describe('runSendJobSweep — publication et rollback CAS', () => {
  it('publie chaque job dû avec le délai restant (0 pour un immédiat)', async () => {
    dueJobs.push(
      { id: 'j1', connectionId: 'c1', scheduledSendAt: null },
      { id: 'j2', connectionId: 'c2', scheduledSendAt: new Date(NOW.getTime() + 3_600_000) },
    );

    const result = await runSendJobSweep({} as never, queue, {
      horizonMs: 12 * 3600 * 1000,
      now: NOW,
      ops,
    });

    expect(queue.send).toHaveBeenCalledWith(
      { messageId: 'j1', jobId: 'j1', connectionId: 'c1' },
      { delaySeconds: 0 },
    );
    expect(queue.send).toHaveBeenCalledWith(
      { messageId: 'j2', jobId: 'j2', connectionId: 'c2' },
      { delaySeconds: 3600 },
    );
    expect(ops.clearSendJobEnqueueMark).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: 2, failed: 0 });
  });

  it('échec de publication → ré-arme le marqueur par CAS avec le timestamp DE CE sweep', async () => {
    dueJobs.push(
      { id: 'j1', connectionId: 'c1', scheduledSendAt: null },
      { id: 'j2', connectionId: 'c2', scheduledSendAt: null },
    );
    queue.send.mockRejectedValueOnce(new Error('queue down'));

    const result = await runSendJobSweep({} as never, queue, {
      horizonMs: 12 * 3600 * 1000,
      now: NOW,
      ops,
    });

    // j1 a échoué → clear CAS (id + enqueuedAt = now du sweep) ; j2 est passé.
    expect(ops.clearSendJobEnqueueMark).toHaveBeenCalledTimes(1);
    expect(ops.clearSendJobEnqueueMark).toHaveBeenCalledWith(expect.anything(), {
      id: 'j1',
      enqueuedAt: NOW,
    });
    expect(result).toEqual({ enqueued: 1, failed: 1 });
  });

  it('un échec du clear CAS ne fait pas échouer la passe (les autres jobs continuent)', async () => {
    dueJobs.push(
      { id: 'j1', connectionId: 'c1', scheduledSendAt: null },
      { id: 'j2', connectionId: 'c2', scheduledSendAt: null },
    );
    queue.send.mockRejectedValueOnce(new Error('queue down'));
    ops.clearSendJobEnqueueMark.mockRejectedValueOnce(new Error('db down'));

    const result = await runSendJobSweep({} as never, queue, {
      horizonMs: 12 * 3600 * 1000,
      now: NOW,
      ops,
    });

    expect(result).toEqual({ enqueued: 1, failed: 1 });
    expect(queue.send).toHaveBeenCalledTimes(2);
  });
});
