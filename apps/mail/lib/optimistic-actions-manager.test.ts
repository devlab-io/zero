import { describe, expect, it, beforeEach } from 'vitest';
import { optimisticActionsManager, type PendingAction } from './optimistic-actions-manager';

function makePending(id: string, type: PendingAction['type'], threadIds: string[]): PendingAction {
  return {
    id,
    type,
    threadIds,
    optimisticId: `opt_${id}`,
    execute: async () => {},
    undo: () => {},
    params: {} as never,
  } as PendingAction;
}

beforeEach(() => {
  optimisticActionsManager.pendingActions.clear();
  optimisticActionsManager.pendingActionsByType.clear();
  optimisticActionsManager.lastActionId = null;
});

describe('optimisticActionsManager — état initial', () => {
  it('démarre vide', () => {
    expect(optimisticActionsManager.pendingActions.size).toBe(0);
    expect(optimisticActionsManager.pendingActionsByType.size).toBe(0);
    expect(optimisticActionsManager.lastActionId).toBeNull();
  });
});

describe('optimisticActionsManager — registre des actions en attente', () => {
  it('enregistre et indexe par type, puis retire proprement', () => {
    const p = makePending('a1', 'READ', ['t1']);
    optimisticActionsManager.pendingActions.set(p.id, p);
    optimisticActionsManager.pendingActionsByType.set('READ', new Set([p.id]));
    optimisticActionsManager.lastActionId = p.id;

    expect(optimisticActionsManager.pendingActions.get('a1')).toBe(p);
    expect(optimisticActionsManager.pendingActionsByType.get('READ')?.has('a1')).toBe(true);

    optimisticActionsManager.pendingActions.delete('a1');
    optimisticActionsManager.pendingActionsByType.get('READ')?.delete('a1');
    expect(optimisticActionsManager.pendingActions.has('a1')).toBe(false);
    expect(optimisticActionsManager.pendingActionsByType.get('READ')?.size).toBe(0);
  });

  it('supporte plusieurs types simultanés', () => {
    const r = makePending('r', 'READ', ['t1']);
    const s = makePending('s', 'STAR', ['t2']);
    optimisticActionsManager.pendingActions.set(r.id, r);
    optimisticActionsManager.pendingActions.set(s.id, s);
    optimisticActionsManager.pendingActionsByType.set('READ', new Set(['r']));
    optimisticActionsManager.pendingActionsByType.set('STAR', new Set(['s']));
    expect(optimisticActionsManager.pendingActions.size).toBe(2);
    expect([...optimisticActionsManager.pendingActionsByType.keys()].sort()).toEqual([
      'READ',
      'STAR',
    ]);
  });
});

describe('optimisticActionsManager — singleton', () => {
  it('est une instance partagée (mêmes Maps entre imports)', async () => {
    const again = await import('./optimistic-actions-manager');
    expect(again.optimisticActionsManager).toBe(optimisticActionsManager);
  });
});
