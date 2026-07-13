import { describe, expect, it } from 'vitest';

import {
  FILTER_OPTIONS,
  IN_PALETTE_VIEW_COMMAND_TITLES,
  PALETTE_COMMANDS,
  PALETTE_TRIGGER_KEYS,
} from './command-registry';

describe('command registry', () => {
  it('exposes palette commands with unique ids and consistent targets', () => {
    const ids = PALETTE_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const cmd of PALETTE_COMMANDS) {
      expect(cmd.title.trim().length).toBeGreaterThan(0);
      expect(cmd.scope).toBe('command-palette');
      expect(['mail', 'search', 'help']).toContain(cmd.group);
      if (cmd.target.kind === 'view') {
        expect(cmd.target.view.length).toBeGreaterThan(0);
      }
    }
  });

  it('derives the in-palette view command titles from the registry', () => {
    // The main view keeps these commands open (view switch) instead of closing.
    expect(IN_PALETTE_VIEW_COMMAND_TITLES).toEqual(['Search Emails', 'Filter Emails']);
  });

  it('exposes filter options with unique ids that build valid query fragments', () => {
    const ids = FILTER_OPTIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const filter of FILTER_OPTIONS) {
      expect(filter.keywords.length).toBeGreaterThan(0);
      const fragment = filter.requiresInput ? filter.action('x') : filter.action();
      expect(typeof fragment).toBe('string');
      expect(fragment.length).toBeGreaterThan(0);
    }
  });

  it('exposes trigger keys for the help UI / #32 parity seam', () => {
    expect(PALETTE_TRIGGER_KEYS.length).toBeGreaterThan(0);
    for (const key of PALETTE_TRIGGER_KEYS) {
      expect(key.display.trim().length).toBeGreaterThan(0);
      expect(key.label.trim().length).toBeGreaterThan(0);
    }
  });
});
