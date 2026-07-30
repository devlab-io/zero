import { describe, expect, it } from 'vitest';

import {
  GLOBAL_HANDLED_ACTIONS,
  NAV_SEQUENCE_ACTIONS,
  THREAD_DISPLAY_HANDLED_ACTIONS,
  MAILLIST_HANDLED_ACTIONS,
  COMPOSE_HANDLED_ACTIONS,
  LIST_IMPERATIVE_ACTIONS,
  COMPOSER_EXTERNAL_ACTIONS,
} from './handler-manifest';
import { keyboardShortcuts, type Shortcut } from '@/config/shortcuts';
import { isTypingOrModalTarget } from './use-hotkey-utils';

// Actions bound through the generic registry binder (useShortcuts), by scope.
const HANDLED_BY_SCOPE: Record<string, readonly string[]> = {
  global: GLOBAL_HANDLED_ACTIONS,
  'thread-display': THREAD_DISPLAY_HANDLED_ACTIONS,
  'mail-list': MAILLIST_HANDLED_ACTIONS,
  compose: COMPOSE_HANDLED_ACTIONS,
};

// Actions of registry rows flagged `ignore` (bound imperatively / externally), by scope.
const IGNORE_BOUND_BY_SCOPE: Record<string, readonly string[]> = {
  list: LIST_IMPERATIVE_ACTIONS,
  compose: COMPOSER_EXTERNAL_ACTIONS,
};

const combo = (shortcut: Shortcut) => shortcut.keys.map((key) => key.toLowerCase()).join('+');

/** The action-set a given shortcut must belong to for it to count as "wired". */
function resolveHandledSet(shortcut: Shortcut): { where: string; set: readonly string[] } | null {
  if (shortcut.ignore) {
    const set = IGNORE_BOUND_BY_SCOPE[shortcut.scope];
    return set ? { where: `ignore:${shortcut.scope}`, set } : null;
  }
  if (shortcut.type === 'sequence') {
    return { where: 'navigation-sequences', set: NAV_SEQUENCE_ACTIONS };
  }
  const set = HANDLED_BY_SCOPE[shortcut.scope];
  return set ? { where: shortcut.scope, set } : null;
}

describe('Shortwave keyboard parity — registry ↔ handler coverage (frozen check #2)', () => {
  it('every registered shortcut resolves to a live handler', () => {
    const unresolved: string[] = [];
    for (const shortcut of keyboardShortcuts) {
      const resolved = resolveHandledSet(shortcut);
      if (!resolved) {
        unresolved.push(`${shortcut.scope}:${shortcut.action} — no handler set for scope/type`);
        continue;
      }
      if (!resolved.set.includes(shortcut.action)) {
        unresolved.push(
          `${shortcut.action} — advertised in ${shortcut.scope} but absent from ${resolved.where}`,
        );
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('no two shortcuts in the same scope bind the same keys to different actions', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const shortcut of keyboardShortcuts) {
      const key = `${shortcut.scope}|${combo(shortcut)}`;
      const existing = seen.get(key);
      if (existing && existing !== shortcut.action) {
        collisions.push(`${key}: ${existing} vs ${shortcut.action}`);
      } else if (!existing) {
        seen.set(key, shortcut.action);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('`g` navigation rows are two-key sequences under the navigation scope', () => {
    const sequences = keyboardShortcuts.filter((shortcut) => shortcut.type === 'sequence');
    expect(sequences.length).toBeGreaterThan(0);
    for (const shortcut of sequences) {
      expect(shortcut.keys).toHaveLength(2);
      expect(shortcut.keys[0]).toBe('g');
      expect(shortcut.scope).toBe('navigation');
    }
  });

  it('every shortcut has a non-empty action and at least one key', () => {
    for (const shortcut of keyboardShortcuts) {
      expect(shortcut.action.length).toBeGreaterThan(0);
      expect(shortcut.keys.length).toBeGreaterThan(0);
    }
  });

  // The frozen check #6 browser smoke exercises these; guard them against silent removal.
  it('the check #6 smoke keys are present and each resolves to a handler', () => {
    const SMOKE_COMBOS = [
      '/',
      'c',
      'r',
      'a',
      'f',
      'd',
      'h',
      's',
      'j',
      'k',
      'x',
      'g+i',
      'mod+k',
      'shift+?',
      'escape',
    ];
    expectCombosWired(SMOKE_COMBOS);
  });

  // 100% of the frozen table — docs/spec/niveau8-mailos.md §Shortwave keyboard contract.
  // Every in-scope key combo must be registered AND resolve to a live handler. The spec's
  // out-of-parity carve-outs (team sharing/assignment/channels/todos, AI snippets,
  // favorite-search number slots, account-number switching) are intentionally NOT here.
  it('every in-scope frozen-table key combo is registered and wired', () => {
    const REQUIRED_TABLE_COMBOS = [
      // Compose
      'c',
      'r',
      'a',
      'f',
      'mod+enter',
      'mod+shift+enter',
      // Global
      '/',
      'escape',
      'shift+?',
      'mod+/',
      'mod+k',
      'mod+shift+k',
      'mod+shift+p',
      'mod+,',
      'mod+shift+l',
      'mod+z',
      // Thread
      'd',
      'e',
      '[',
      ']',
      'b',
      'h',
      's',
      'l',
      'v',
      '#',
      'delete',
      'mod+backspace',
      'u',
      'shift+u',
      'shift+i',
      '+',
      '-',
      // List
      'j',
      'arrowdown',
      'k',
      'arrowup',
      'x',
      'enter',
      'arrowright',
      'arrowleft',
      'space',
      'shift+space',
      // Layout
      'mod+\\',
      // Navigate (g …)
      'g+i',
      'g+s',
      'g+b',
      'g+h',
      'g+e',
      'g+t',
      'g+d',
      'g+!',
      'g+#',
    ];
    expectCombosWired(REQUIRED_TABLE_COMBOS);
  });
});

/** Assert each key combo is registered AND at least one of its rows resolves to a handler. */
function expectCombosWired(combos: string[]) {
  const missing: string[] = [];
  for (const wanted of combos) {
    const rows = keyboardShortcuts.filter((shortcut) => combo(shortcut) === wanted);
    if (rows.length === 0) {
      missing.push(`${wanted} — not registered`);
      continue;
    }
    const anyWired = rows.some((shortcut) => {
      const resolved = resolveHandledSet(shortcut);
      return resolved?.set.includes(shortcut.action);
    });
    if (!anyWired) missing.push(`${wanted} — registered but unwired`);
  }
  expect(missing).toEqual([]);
}

describe('single-key exclusion — isTypingOrModalTarget (frozen check #4)', () => {
  it('is true for input, textarea and select elements', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingOrModalTarget(document.createElement(tag))).toBe(true);
    }
  });

  it('is true for a contenteditable node (TipTap / ProseMirror)', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    expect(isTypingOrModalTarget(editor)).toBe(true);
  });

  it('is true for a node nested inside a contenteditable', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editor.appendChild(inner);
    expect(isTypingOrModalTarget(inner)).toBe(true);
  });

  it('is true for a node inside an open dialog', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    expect(isTypingOrModalTarget(button)).toBe(true);
  });

  it('is false for a plain element and for a null target', () => {
    expect(isTypingOrModalTarget(document.createElement('div'))).toBe(false);
    expect(isTypingOrModalTarget(null)).toBe(false);
  });
});

describe('pickers l/v — preventDefault (CUA 2026-07-30, échec 5)', () => {
  it('les raccourcis openLabels/openMove annulent le keydown, sinon la lettre filtre le combo', () => {
    // Le picker focuse son CommandInput pendant la frappe même : sans
    // preventDefault, le `v` du raccourci s'insère dans l'input et filtre
    // toutes les destinations (il fallait effacer pour voir Inbox).
    const pickers = keyboardShortcuts.filter(
      (s) => s.scope === 'thread-display' && (s.action === 'openLabels' || s.action === 'openMove'),
    );
    expect(pickers.map((s) => s.action).sort()).toEqual(['openLabels', 'openMove']);
    for (const s of pickers) expect(s.preventDefault).toBe(true);
  });

  it('r/a/f (les deux scopes) annulent aussi le keydown — le composer TipTap monte de plus en plus tôt', () => {
    const replyActions = new Set([
      'reply',
      'replyAll',
      'forward',
      'replyToThread',
      'replyAllToThread',
      'forwardThread',
    ]);
    const rows = keyboardShortcuts.filter(
      (s) =>
        (s.scope === 'thread-display' || s.scope === 'mail-list') && replyActions.has(s.action),
    );
    expect(rows).toHaveLength(6);
    for (const s of rows) expect(s.preventDefault).toBe(true);
  });
});
