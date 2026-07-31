import {
  DEFAULT_VISIBLE_SIDEBAR_LABELS,
  isSidebarLabelToggleKey,
  rankSidebarLabels,
  visibleSidebarLabels,
} from './sidebar-labels-order';
import { describe, expect, it } from 'vitest';

describe('sidebar label decluttering', () => {
  it('puts active labels first and sorts equal counts alphabetically', () => {
    const input = [
      { name: 'Zulu', count: 0 },
      { name: 'À répondre', count: 4 },
      { name: 'Needs Action', count: 12 },
      { name: 'Compta', count: 4 },
    ];

    expect(rankSidebarLabels(input).map((label) => label.name)).toEqual([
      'Needs Action',
      'À répondre',
      'Compta',
      'Zulu',
    ]);
    expect(input[0]?.name).toBe('Zulu');
  });

  it('shows eight labels by default and all labels on demand', () => {
    const labels = Array.from({ length: 12 }, (_, index) => `label-${index}`);
    expect(visibleSidebarLabels(labels, false)).toHaveLength(DEFAULT_VISIBLE_SIDEBAR_LABELS);
    expect(visibleSidebarLabels(labels, true)).toHaveLength(12);
  });

  it('handles button activation keys without leaking into mail shortcuts', () => {
    expect(isSidebarLabelToggleKey('Enter')).toBe(true);
    expect(isSidebarLabelToggleKey(' ')).toBe(true);
    expect(isSidebarLabelToggleKey('ArrowDown')).toBe(false);
  });
});
