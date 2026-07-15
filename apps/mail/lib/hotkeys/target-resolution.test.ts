import { describe, expect, it } from 'vitest';

import { resolveRowTargetId, resolveTargetIds } from './target-resolution';

const items = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];

describe('resolveTargetIds — bulk selection, keyboard focus, then hover', () => {
  it('keyboard focus wins over an incidental hovered row', () => {
    expect(resolveTargetIds('hov', 1, items, [])).toEqual(['t2']);
  });

  it('falls back to the hovered row when there is no keyboard focus', () => {
    expect(resolveTargetIds('hov', null, items, [])).toEqual(['hov']);
  });

  it('falls back to bulk selection when neither focus nor hover targets a row', () => {
    expect(resolveTargetIds(null, null, items, ['t1', 't3'])).toEqual(['t1', 't3']);
  });

  it('a live bulk selection wins over hover and focus', () => {
    expect(resolveTargetIds('hov', 1, items, ['t3'])).toEqual(['t3']);
  });

  it('resolves a row independently of a live bulk selection for x toggling', () => {
    expect(resolveRowTargetId('hov', 1, items)).toBe('t2');
    expect(resolveRowTargetId('hov', null, items)).toBe('hov');
  });

  it('returns [] when nothing is targeted at all', () => {
    expect(resolveTargetIds(null, null, items, [])).toEqual([]);
  });

  it('ignores a focused index that fell outside the list', () => {
    expect(resolveTargetIds(null, 7, items, [])).toEqual([]);
  });
});
