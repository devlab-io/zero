import { runThreadRemovalNavigation } from '@/hooks/use-mail-navigation';
import { runImportantToggle } from './thread-display.triage';
import { describe, expect, it, vi } from 'vitest';

function runSuccessiveTriage(count: number, workflow: string) {
  let items = Array.from({ length: count }, (_, index) => ({ id: `thread-${index}` }));
  let currentId: string | null = items[0]?.id ?? null;
  let focusedIndex: number | null = items.length ? 0 : null;
  const visited: string[] = [];
  const callOrder: string[] = [];

  while (currentId) {
    const removedId = currentId;
    visited.push(removedId);
    let mutationFinished = false;

    // This is the exact identity-first helper consumed by click archive, header archive and the
    // thread-display archive/snooze hotkeys. The mutation deliberately clears URL/focus just like
    // the optimistic action, so the assertions prove restoration happens afterwards.
    runThreadRemovalNavigation({
      items,
      currentId: removedId,
      mutate: () => {
        callOrder.push(`${workflow}:mutate:${removedId}`);
        items = items.filter((item) => item.id !== removedId);
        currentId = null;
        focusedIndex = null;
        mutationFinished = true;
      },
      setThreadId: (nextId) => {
        expect(mutationFinished).toBe(true);
        callOrder.push(`${workflow}:url:${nextId ?? 'closed'}`);
        currentId = nextId;
      },
      setFocusedIndex: (nextIndex) => {
        expect(mutationFinished).toBe(true);
        callOrder.push(`${workflow}:focus:${nextIndex ?? 'closed'}`);
        focusedIndex = nextIndex;
      },
    });

    if (currentId) {
      // URL identity and focus index point to the same successor after removal.
      expect(items[focusedIndex ?? -1]?.id).toBe(currentId);
    } else {
      expect(focusedIndex).toBeNull();
    }
  }

  return { visited, items, currentId, focusedIndex, callOrder };
}

describe('thread triage successor', () => {
  it.each([1, 2, 20])(
    'keeps archive, snooze and navigation identity-safe across %i threads',
    (count) => {
      for (const workflow of ['click-archive', 'hotkey-archive', 'hotkey-snooze']) {
        const result = runSuccessiveTriage(count, workflow);
        expect(result.visited, workflow).toEqual(
          Array.from({ length: count }, (_, index) => `thread-${index}`),
        );
        expect(result.items, workflow).toEqual([]);
        expect(result.currentId, workflow).toBeNull();
        expect(result.focusedIndex, workflow).toBeNull();
        expect(result.callOrder[0], workflow).toBe(`${workflow}:mutate:thread-0`);
      }
    },
  );

  it('resolves archive-previous by identity before removal and restores its shifted index', () => {
    let items = [{ id: 'thread-0' }, { id: 'thread-1' }, { id: 'thread-2' }];
    let threadId: string | null = 'thread-1';
    let focusedIndex: number | null = 1;

    const navigation = runThreadRemovalNavigation({
      items,
      currentId: 'thread-1',
      direction: 'previous',
      mutate: () => {
        items = items.filter((item) => item.id !== 'thread-1');
        threadId = null;
        focusedIndex = null;
      },
      setThreadId: (nextId) => {
        threadId = nextId;
      },
      setFocusedIndex: (nextIndex) => {
        focusedIndex = nextIndex;
      },
    });

    expect(navigation).toEqual({ threadId: 'thread-0', focusedIndex: 0 });
    expect(items[focusedIndex ?? -1]?.id).toBe(threadId);
  });

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
