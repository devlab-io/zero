import { keyboardLayoutMapper } from '../utils/keyboard-layout-map';
import { getKeyCodeFromKey } from '../utils/keyboard-utils';
import { isMac } from '@/lib/platform';

// Machine-readable Shortwave keyboard-parity registry (issue #32).
//
// This module is the SINGLE source of truth for the keyboard contract: the hotkey
// handlers (apps/mail/lib/hotkeys/**) bind from it, and the settings/help UI
// (app/(routes)/settings/shortcuts/page.tsx) renders from it via useShortcutCache —
// so a shortcut can never be advertised without a registration, nor handled without
// being listed. Every in-scope row of docs/spec/niveau8-mailos.md §Shortwave keyboard
// contract appears here with its exact key aliases and contextual scope.
//
// `mod` = Command on macOS, Control elsewhere. Types:
//   - single       one bare key (suppressed while typing — see use-hotkey-utils)
//   - combination   a modifier chord (safe while typing)
//   - sequence      two keys pressed in order within a bounded timeout (the `g …` set)

// #a8-weight-hunt LEAD F: the shortcut shape is a plain interface, not a zod schema. It was only
// ever consumed as a type (z.infer) and never runtime-validated (no .parse/.safeParse anywhere),
// so importing zod here pulled ~12 KiB gz of dead runtime weight into the cold /mail/inbox closure
// (this module is loaded eagerly by lib/hotkeys/**). Shape is identical; runtime behaviour unchanged.
export interface Shortcut {
  keys: string[];
  action: string;
  type: 'single' | 'combination' | 'sequence';
  description: string;
  scope: string;
  preventDefault?: boolean;
  /** Documentation-only row: rendered in help, bound outside the registry (e.g. list focus keys). */
  ignore?: boolean;
}

export type ShortcutType = Shortcut['type'];

/**
 * Enhanced shortcut type with keyboard layout mapping support
 */
export interface EnhancedShortcut extends Shortcut {
  mappedKeys?: string[];
  displayKeys?: string[];
}

/**
 * Convert key codes to user-friendly display keys using keyboard layout mapping
 */
export function getDisplayKeysForShortcut(shortcut: Shortcut): string[] {
  const detectedLayout = keyboardLayoutMapper.getDetectedLayout();

  return shortcut.keys.map((key) => {
    // Handle special modifiers first
    switch (key.toLowerCase()) {
      case 'mod':
        return isMac ? '⌘' : 'Ctrl';
      case 'meta':
        return '⌘';
      case 'ctrl':
      case 'control':
        return 'Ctrl';
      case 'alt':
        return isMac ? '⌥' : 'Alt';
      case 'shift':
        return '⇧';
      case 'escape':
        return 'Esc';
      case 'backspace':
        return '⌫';
      case 'delete':
        return '⌦';
      case 'enter':
        return '↵';
      case 'space':
        return 'Space';
      default: {
        // Use enhanced keyboard layout mapping
        if (detectedLayout?.layout && detectedLayout.layout !== 'qwerty') {
          const keyCode = getKeyCodeFromKey(key);
          const mappedKey = keyboardLayoutMapper.getKeyForCode(keyCode);
          return mappedKey.length === 1 ? mappedKey.toUpperCase() : mappedKey;
        }
        return key.length === 1 ? key.toUpperCase() : key;
      }
    }
  });
}

/**
 * Enhance shortcuts with keyboard layout mapping
 */
export function enhanceShortcutsWithMapping(shortcuts: Shortcut[]): EnhancedShortcut[] {
  return shortcuts.map((shortcut) => ({
    ...shortcut,
    displayKeys: getDisplayKeysForShortcut(shortcut),
    mappedKeys: keyboardLayoutMapper.mapKeys(shortcut.keys.map(getKeyCodeFromKey)),
  }));
}

/** Terse constructor so the tables below read like the spec grid. */
const shortcut = (
  keys: string[],
  action: string,
  description: string,
  scope: string,
  options: Pick<Shortcut, 'type' | 'preventDefault' | 'ignore'> = { type: 'single' },
): Shortcut => ({ keys, action, description, scope, ...options });

// Navigate: real timed two-key sequences (`g` then a letter), never a chord.
//
// `g s` (Shortwave "starred") navigates to the EXISTING `is:starred` search (Zero has
// no starred folder route, but the search filter is a live, functional view — see
// navigation-hotkeys.tsx), so parity is met without inventing a route.
const navigation: Shortcut[] = [
  shortcut(['g', 'i'], 'inbox', 'Go to inbox', 'navigation', { type: 'sequence' }),
  shortcut(['g', 's'], 'goToStarred', 'Go to starred', 'navigation', { type: 'sequence' }),
  shortcut(['g', 'b'], 'goToSnoozed', 'Go to snoozed', 'navigation', { type: 'sequence' }),
  shortcut(['g', 'h'], 'goToSnoozed', 'Go to snoozed', 'navigation', { type: 'sequence' }),
  shortcut(['g', 'e'], 'goToArchive', 'Go to done', 'navigation', { type: 'sequence' }),
  shortcut(['g', 'a'], 'goToArchive', 'Go to archive', 'navigation', { type: 'sequence' }),
  shortcut(['g', 't'], 'sentMail', 'Go to sent mail', 'navigation', { type: 'sequence' }),
  shortcut(['g', 'd'], 'goToDrafts', 'Go to drafts', 'navigation', { type: 'sequence' }),
  shortcut(['g', '!'], 'goToSpam', 'Go to spam', 'navigation', { type: 'sequence' }),
  shortcut(['g', '#'], 'goToBin', 'Go to bin', 'navigation', { type: 'sequence' }),
];

const globalShortcuts: Shortcut[] = [
  shortcut(['c'], 'newEmail', 'Compose new email', 'global', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['/'], 'search', 'Search email', 'global', { type: 'single', preventDefault: true }),
  shortcut(['mod', 'k'], 'commandPalette', 'Open command palette', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', 'shift', 'k'], 'commandPalette', 'Open command palette', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', 'shift', 'p'], 'commandPalette', 'Open command palette', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['shift', '?'], 'helpWithShortcuts', 'Show keyboard shortcuts', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', '/'], 'helpWithShortcuts', 'Show keyboard shortcuts', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', ','], 'goToSettings', 'Go to settings', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', 'shift', 'l'], 'toggleTheme', 'Toggle theme', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', '\\'], 'toggleSidebar', 'Toggle sidebar', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', 'z'], 'undoLastAction', 'Undo last reversible action', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', 'shift', 'f'], 'clearAllFilters', 'Clear all filters', 'global', {
    type: 'combination',
    preventDefault: true,
  }),
];

const mailListShortcuts: Shortcut[] = [
  // preventDefault : ces raccourcis montent le composer TipTap. Le focus éditeur
  // est aujourd'hui différé (setTimeout), mais un mount plus rapide (chunks
  // préchauffés) rapprocherait le focus du keydown — on annule le défaut pour
  // que la lettre ne puisse jamais s'insérer dans le corps du mail (même classe
  // que le bug picker v, CUA échec 5).
  shortcut(['r'], 'replyToThread', 'Reply to focused email', 'mail-list', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['a'], 'replyAllToThread', 'Reply all to focused email', 'mail-list', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['f'], 'forwardThread', 'Forward focused email', 'mail-list', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['d'], 'archiveEmail', 'Done — archive', 'mail-list'),
  shortcut(['e'], 'archiveEmail', 'Done — archive', 'mail-list'),
  shortcut(['b'], 'remindThread', 'Snooze focused email', 'mail-list'),
  shortcut(['h'], 'remindThread', 'Snooze focused email', 'mail-list'),
  shortcut(['s'], 'bulkStar', 'Toggle star', 'mail-list'),
  shortcut(['u'], 'markAsUnread', 'Mark as unread', 'mail-list'),
  shortcut(['shift', 'u'], 'markAsUnread', 'Mark as unread', 'mail-list', { type: 'combination' }),
  shortcut(['shift', 'i'], 'markAsRead', 'Mark as read', 'mail-list', { type: 'combination' }),
  shortcut(['+'], 'markAsImportant', 'Mark as important', 'mail-list'),
  shortcut(['-'], 'markAsNotImportant', 'Mark as not important', 'mail-list'),
  shortcut(['x'], 'toggleFocusedSelection', 'Select focused email', 'mail-list'),
  shortcut(['#'], 'bulkDelete', 'Move to bin', 'mail-list', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['delete'], 'bulkDelete', 'Move to bin', 'mail-list', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['mod', 'backspace'], 'bulkDelete', 'Move to bin', 'mail-list', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['mod', 'a'], 'selectAll', 'Select all emails', 'mail-list', {
    type: 'combination',
    preventDefault: true,
  }),
  // Space / shift+Space paging lives in the imperative `list` group below: the real
  // scroller is the virtua VList inside mail-list.tsx (must-not-touch) and paging is
  // driven from use-mail-navigation.ts, which holds the list container ref.
  shortcut(['escape'], 'exitSelectionMode', 'Clear selection', 'mail-list', {
    type: 'single',
    preventDefault: true,
  }),
];

const threadDisplayShortcuts: Shortcut[] = [
  // preventDefault sur r/a/f : même garde anti-insertion que côté mail-list
  // (le composer monte plus vite avec les chunks préchauffés).
  shortcut(['r'], 'reply', 'Reply to email', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['a'], 'replyAll', 'Reply all', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['f'], 'forward', 'Forward email', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['d'], 'archive', 'Done — archive and go next', 'thread-display'),
  shortcut(['e'], 'archive', 'Done — archive and go next', 'thread-display'),
  shortcut(['['], 'archiveNext', 'Done and open next', 'thread-display'),
  shortcut([']'], 'archivePrevious', 'Done and open previous', 'thread-display'),
  shortcut(['b'], 'remind', 'Snooze email', 'thread-display'),
  shortcut(['h'], 'remind', 'Snooze email', 'thread-display'),
  shortcut(['s'], 'toggleStar', 'Toggle star', 'thread-display'),
  // `l`/`v` open the label / move picker (components/mail/label-move-picker.tsx), driven
  // by the `picker` query-state the handler sets — see thread-display-hotkeys.tsx.
  // preventDefault : le picker focuse son CommandInput pendant le keydown même ;
  // sans lui, la lettre du raccourci s'insère dans le combo et filtre tout (CUA échec 5).
  shortcut(['l'], 'openLabels', 'Open label picker', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['v'], 'openMove', 'Open move picker', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['u'], 'markAsUnread', 'Mark as unread', 'thread-display'),
  shortcut(['shift', 'u'], 'markAsUnread', 'Mark as unread', 'thread-display', {
    type: 'combination',
  }),
  shortcut(['shift', 'i'], 'markAsRead', 'Mark as read', 'thread-display', { type: 'combination' }),
  shortcut(['+'], 'markAsImportant', 'Mark as important', 'thread-display'),
  shortcut(['-'], 'markAsNotImportant', 'Mark as not important', 'thread-display'),
  shortcut(['#'], 'delete', 'Move to bin', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['delete'], 'delete', 'Move to bin', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
  shortcut(['mod', 'backspace'], 'delete', 'Move to bin', 'thread-display', {
    type: 'combination',
    preventDefault: true,
  }),
  shortcut(['escape'], 'closeView', 'Close thread', 'thread-display', {
    type: 'single',
    preventDefault: true,
  }),
];

const composeShortcuts: Shortcut[] = [
  // `mod+Enter` (send) and `mod+shift+Enter` (send + archive/done) are bound INSIDE the
  // composer (email-composer.tsx) — the send path needs the composer's live form/editor
  // state — not through the generic hotkey binder. Registered `ignore`d so the help UI
  // documents them and the coverage test accounts for their external binding without the
  // binder double-firing them.
  shortcut(['mod', 'enter'], 'sendEmail', 'Send email', 'compose', {
    type: 'combination',
    preventDefault: true,
    ignore: true,
  }),
  shortcut(['mod', 'shift', 'enter'], 'sendAndArchive', 'Send and archive (done)', 'compose', {
    type: 'combination',
    preventDefault: true,
    ignore: true,
  }),
  shortcut(['escape'], 'closeCompose', 'Close composer', 'compose'),
];

// List focus/paging keys handled imperatively in hooks/use-mail-navigation.ts (they need
// the live list container + repeat handling react-hotkeys-hook does not model). Registered
// here `ignore`d so the help UI documents them and the coverage test can assert their live
// bindings, without the generic hotkey binder double-registering them.
const listShortcuts: Shortcut[] = [
  shortcut(['j'], 'focusNext', 'Focus next', 'list', { type: 'single', ignore: true }),
  shortcut(['ArrowDown'], 'focusNext', 'Focus next', 'list', { type: 'single', ignore: true }),
  shortcut(['k'], 'focusPrevious', 'Focus previous', 'list', { type: 'single', ignore: true }),
  shortcut(['ArrowUp'], 'focusPrevious', 'Focus previous', 'list', {
    type: 'single',
    ignore: true,
  }),
  shortcut(['Enter'], 'openFocused', 'Open focused', 'list', { type: 'single', ignore: true }),
  shortcut(['ArrowRight'], 'openFocused', 'Open focused', 'list', { type: 'single', ignore: true }),
  shortcut(['ArrowLeft'], 'closeList', 'Close thread / clear selection', 'list', {
    type: 'single',
    ignore: true,
  }),
  shortcut(['space'], 'pageDown', 'Page down', 'list', { type: 'single', ignore: true }),
  shortcut(['shift', 'space'], 'pageUp', 'Page up', 'list', { type: 'combination', ignore: true }),
];

export const keyboardShortcuts: Shortcut[] = [
  ...navigation,
  ...globalShortcuts,
  ...mailListShortcuts,
  ...threadDisplayShortcuts,
  ...composeShortcuts,
  ...listShortcuts,
];

/**
 * Enhanced keyboard shortcuts with layout mapping
 */
export const enhancedKeyboardShortcuts: EnhancedShortcut[] =
  enhanceShortcutsWithMapping(keyboardShortcuts);
