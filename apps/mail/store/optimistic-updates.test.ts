import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import {
  addOptimisticActionAtom,
  generateOptimisticId,
  getThreadOptimisticActions,
  isThreadAffectedByOptimisticAction,
  optimisticActionsAtom,
  removeOptimisticActionAtom,
  type OptimisticAction,
} from './optimistic-updates';

const readAction: OptimisticAction = { type: 'READ', threadIds: ['t1', 't2'], read: true };
const starAction: OptimisticAction = { type: 'STAR', threadIds: ['t2'], starred: true };

describe('optimistic-updates — store (add/remove)', () => {
  it('addOptimisticActionAtom insère et renvoie un id ; l’action est lisible', () => {
    const store = createStore();
    const id = store.set(addOptimisticActionAtom, readAction);
    expect(typeof id).toBe('string');
    expect(store.get(optimisticActionsAtom)).toEqual({ [id]: readAction });
  });

  it('removeOptimisticActionAtom retire uniquement l’id ciblé', () => {
    const store = createStore();
    const id1 = store.set(addOptimisticActionAtom, readAction);
    const id2 = store.set(addOptimisticActionAtom, starAction);
    store.set(removeOptimisticActionAtom, id1);
    const state = store.get(optimisticActionsAtom);
    expect(state[id1]).toBeUndefined();
    expect(state[id2]).toEqual(starAction);
  });
});

describe('optimistic-updates — sélecteurs dérivés', () => {
  it('isThreadAffectedByOptimisticAction : vrai si un fil est concerné', () => {
    const store = createStore();
    store.set(addOptimisticActionAtom, readAction);
    expect(store.get(isThreadAffectedByOptimisticAction('t1'))).toBe(true);
    expect(store.get(isThreadAffectedByOptimisticAction('absent'))).toBe(false);
  });

  it('isThreadAffectedByOptimisticAction : filtre par type d’action', () => {
    const store = createStore();
    store.set(addOptimisticActionAtom, readAction); // t1,t2 READ
    store.set(addOptimisticActionAtom, starAction); // t2 STAR
    expect(store.get(isThreadAffectedByOptimisticAction('t2', 'STAR'))).toBe(true);
    expect(store.get(isThreadAffectedByOptimisticAction('t1', 'STAR'))).toBe(false);
    expect(store.get(isThreadAffectedByOptimisticAction('t1', 'READ'))).toBe(true);
  });

  it('getThreadOptimisticActions : renvoie les actions {id,...} d’un fil', () => {
    const store = createStore();
    const id = store.set(addOptimisticActionAtom, readAction);
    const actions = store.get(getThreadOptimisticActions('t1'));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id, type: 'READ', threadIds: ['t1', 't2'] });
    expect(store.get(getThreadOptimisticActions('absent'))).toEqual([]);
  });
});

describe('generateOptimisticId', () => {
  it('respecte le format opt_<ts>_<suffixe> et reste unique en volume', () => {
    expect(generateOptimisticId()).toMatch(/^opt_\d+_[a-z0-9]+$/);
    const ids = new Set(Array.from({ length: 200 }, () => generateOptimisticId()));
    expect(ids.size).toBe(200);
  });
});
