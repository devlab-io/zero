import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZeroDriverInternal } from './internal';

const dbMocks = vi.hoisted(() => ({
  getThreadLabels: vi.fn(),
  modifyThreadLabels: vi.fn(),
}));
const loggerMocks = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));

vi.mock('./db', () => dbMocks);
vi.mock('../../lib/logger', () => ({ logger: loggerMocks }));

import { modifyThreadLabelsInDB } from './labels';

describe('modifyThreadLabelsInDB', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not reload folders or broadcast when the thread is not synced', async () => {
    dbMocks.getThreadLabels.mockResolvedValue([]);
    dbMocks.modifyThreadLabels.mockResolvedValue({
      threadFound: false,
      addedLabels: [],
      removedLabels: [],
    });

    const reloadFolder = vi.fn();
    const broadcastChatMessage = vi.fn();
    const self = {
      db: {},
      reloadFolder,
      agent: { broadcastChatMessage },
    } as unknown as ZeroDriverInternal;

    await expect(modifyThreadLabelsInDB(self, 'missing-thread', ['INBOX'], [])).resolves.toEqual({
      success: false,
      threadId: 'missing-thread',
      previousLabels: [],
      addedLabels: [],
      removedLabels: [],
      skipped: 'thread_not_found',
    });

    expect(reloadFolder).not.toHaveBeenCalled();
    expect(broadcastChatMessage).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      '[labels] Skipped local label mutation because the thread is not synced',
      { threadIdLength: 14, addCount: 1, removeCount: 0 },
    );
  });
});
