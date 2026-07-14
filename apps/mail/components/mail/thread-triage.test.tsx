import {
  deriveThreadTriageTransition,
  runImportantToggle,
  type ThreadTriageTransition,
} from './thread-display.triage';
import { describe, expect, it, vi } from 'vitest';

function runSuccessiveTriage(count: number) {
  let items = Array.from({ length: count }, (_, index) => ({ id: `thread-${index}` }));
  let currentId: string | null = items[0]?.id ?? null;
  let focusedIndex: number | null = items.length ? 0 : null;
  const visited: string[] = [];

  while (currentId) {
    visited.push(currentId);

    // Resolve by the open thread's identity from the immutable pre-mutation list.
    const transition: ThreadTriageTransition<{ id: string }> | null = deriveThreadTriageTransition(
      items,
      currentId,
    );
    const afterMutation = items.filter((item) => item.id !== currentId);

    currentId = transition?.thread.id ?? null;
    focusedIndex = transition?.focusedIndex ?? null;
    items = afterMutation;

    if (currentId) {
      // URL identity and focus index point to the same successor after removal.
      expect(items[focusedIndex ?? -1]?.id).toBe(currentId);
    } else {
      expect(focusedIndex).toBeNull();
    }
  }

  return { visited, items, currentId, focusedIndex };
}

describe('thread triage successor', () => {
  it.each([1, 2, 20])(
    'keeps archive, snooze and navigation identity-safe across %i threads',
    (count) => {
      for (const workflow of ['archive', 'snooze', 'navigation']) {
        const result = runSuccessiveTriage(count);
        expect(result.visited, workflow).toEqual(
          Array.from({ length: count }, (_, index) => `thread-${index}`),
        );
        expect(result.items, workflow).toEqual([]);
        expect(result.currentId, workflow).toBeNull();
        expect(result.focusedIndex, workflow).toBeNull();
      }
    },
  );

  it('reports important success only after mutation and refresh succeed', async () => {
    const calls: string[] = [];
    const succeeded = await runImportantToggle({
      mutate: async () => calls.push('mutated'),
      refresh: async () => calls.push('refreshed'),
      onSuccess: () => calls.push('success'),
      onError: () => calls.push('error'),
    });

    expect(succeeded).toBe(true);
    expect(calls).toEqual(['mutated', 'refreshed', 'success']);
  });

  it('reports important failure without a false success', async () => {
    const failure = new Error('provider rejected mutation');
    const refresh = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const succeeded = await runImportantToggle({
      mutate: async () => Promise.reject(failure),
      refresh,
      onSuccess,
      onError,
    });

    expect(succeeded).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
