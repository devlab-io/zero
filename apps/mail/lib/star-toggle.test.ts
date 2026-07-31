import { resolveNextStarredState, resolveStarredState } from './star-toggle';
import type { OptimisticAction } from '@/store/optimistic-updates';
import { describe, expect, it } from 'vitest';

const actions = (...values: OptimisticAction[]) =>
  Object.fromEntries(values.map((action, index) => [`action-${index}`, action]));

describe('star shortcut toggle state', () => {
  it('stars an unstarred thread and unstars a starred thread', () => {
    expect(resolveNextStarredState(['t1'], { t1: false }, {})).toBe(true);
    expect(resolveNextStarredState(['t1'], { t1: true }, {})).toBe(false);
  });

  it('uses the latest optimistic state so a second S reverses the first immediately', () => {
    const pending = actions(
      { type: 'STAR', threadIds: ['t1'], starred: true },
      { type: 'STAR', threadIds: ['t1'], starred: false },
    );
    expect(resolveStarredState('t1', false, pending)).toBe(false);
    expect(resolveNextStarredState(['t1'], { t1: false }, pending)).toBe(true);
  });

  it('unstars a selection only when every selected thread is starred', () => {
    expect(resolveNextStarredState(['t1', 't2'], { t1: true, t2: true }, {})).toBe(false);
    expect(resolveNextStarredState(['t1', 't2'], { t1: true, t2: false }, {})).toBe(true);
  });

  it('lets optimistic state override stale server tags in a mixed selection', () => {
    const pending = actions({ type: 'STAR', threadIds: ['t2'], starred: true });
    expect(resolveNextStarredState(['t1', 't2'], { t1: true, t2: false }, pending)).toBe(false);
  });
});
