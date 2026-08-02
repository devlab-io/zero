import { deleteDraftsBatched } from './delete-drafts-batched';
import { describe, expect, it, vi } from 'vitest';

describe('deleteDraftsBatched', () => {
  it('deduplicates draft ids and deletes in bounded batches', async () => {
    let active = 0;
    let maxActive = 0;
    const deleted: string[] = [];
    const remove = vi.fn(async (id: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      deleted.push(id);
      active -= 1;
    });

    await expect(deleteDraftsBatched(['a', 'b', 'a', 'c', 'd'], remove, 2)).resolves.toBe(4);
    expect(deleted).toEqual(['a', 'b', 'c', 'd']);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('is a no-op for an empty list', async () => {
    const remove = vi.fn(async () => {});
    await expect(deleteDraftsBatched([], remove)).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });
});
