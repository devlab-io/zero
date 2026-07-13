import { describe, expect, it, vi } from 'vitest';
import { buildOptimisticFailureToast, isLastPendingOfType } from './optimistic-recovery';

// Issue #34, check point 6: a failed optimistic action surfaces a recovery action.

describe('buildOptimisticFailureToast', () => {
  it('surfaces a retry recovery action wired to onRetry', () => {
    const onRetry = vi.fn();
    const toast = buildOptimisticFailureToast({
      failedLabel: 'Action failed',
      retryLabel: 'Retry',
      onRetry,
    });

    expect(toast.message).toBe('Action failed');
    expect(toast.action.label).toBe('Retry');
    expect(toast.duration).toBeGreaterThan(0);

    toast.action.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('isLastPendingOfType — routed #35 success-refresh fix', () => {
  it('is true only when exactly one action of the type is pending before removal', () => {
    expect(isLastPendingOfType(1)).toBe(true);
    expect(isLastPendingOfType(2)).toBe(false);
    expect(isLastPendingOfType(0)).toBe(false);
  });

  it('models the ordering bug: reading size AFTER removal (0) never refreshes; BEFORE (1) does', () => {
    const pendingOfType = new Set<string>(['pending_1']);
    const sizeBeforeRemoval = pendingOfType.size;
    pendingOfType.delete('pending_1'); // the delete the hook performs on the SAME set
    const sizeAfterRemoval = pendingOfType.size;

    expect(isLastPendingOfType(sizeBeforeRemoval)).toBe(true); // fixed: refresh fires
    expect(isLastPendingOfType(sizeAfterRemoval)).toBe(false); // old dead path
  });

  it('a bulk of the same type only refreshes when the LAST one completes', () => {
    // Two pending of the same type; the first completion sees size 2 (no refresh),
    // the last sees size 1 (refresh once).
    const pendingOfType = new Set<string>(['a', 'b']);
    expect(isLastPendingOfType(pendingOfType.size)).toBe(false);
    pendingOfType.delete('a');
    expect(isLastPendingOfType(pendingOfType.size)).toBe(true);
  });
});
