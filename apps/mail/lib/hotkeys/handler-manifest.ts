// Keyboard-parity handler manifest (issue #32) — PURE, data-only.
//
// Each array names the actions a given scope wires. The hotkey components import
// their array from here to TYPE their `handlers` map (`Record<(typeof X)[number], …>`),
// so tsc fails the moment a component's handlers drift from its declared set. The
// keyboard-parity coverage test (keyboard-parity.test.ts) then asserts that every
// registered shortcut in `shortcuts.ts` resolves to one of these sets — closing the
// loop the frozen check demands: no advertised shortcut without a live handler.
//
// Kept free of React/DOM imports so the coverage test loads it with zero component graph.

/** `global` scope — bound by GlobalHotkeys via useShortcuts. */
export const GLOBAL_HANDLED_ACTIONS = [
  'newEmail',
  'search',
  'commandPalette',
  'helpWithShortcuts',
  'goToSettings',
  'toggleTheme',
  'toggleSidebar',
  'undoLastAction',
  'clearAllFilters',
] as const;

/** `navigation` scope — timed `g …` sequences, bound by NavigationHotkeys via useShortcutSequences. */
export const NAV_SEQUENCE_ACTIONS = [
  'inbox',
  'goToStarred',
  'goToSnoozed',
  'goToArchive',
  'sentMail',
  'goToDrafts',
  'goToSpam',
  'goToBin',
] as const;

/** `thread-display` scope — bound by ThreadDisplayHotkeys via useShortcuts. */
export const THREAD_DISPLAY_HANDLED_ACTIONS = [
  'openNext',
  'openPrevious',
  'reply',
  'replyAll',
  'forward',
  'archive',
  'archiveNext',
  'archivePrevious',
  'remind',
  'toggleStar',
  'openLabels',
  'openMove',
  'markAsUnread',
  'markAsRead',
  'markAsImportant',
  'markAsNotImportant',
  'delete',
  'closeView',
] as const;

/** `mail-list` scope — bound by MailListHotkeys via useShortcuts. */
export const MAILLIST_HANDLED_ACTIONS = [
  'markAsRead',
  'markAsUnread',
  'markAsImportant',
  'markAsNotImportant',
  'toggleFocusedSelection',
  'selectAll',
  'archiveEmail',
  'bulkDelete',
  'bulkStar',
  'exitSelectionMode',
  'replyToThread',
  'replyAllToThread',
  'forwardThread',
  'remindThread',
] as const;

/** `compose` scope — bound by ComposeHotkeys via useShortcuts (sendEmail is external, below). */
export const COMPOSE_HANDLED_ACTIONS = ['closeCompose'] as const;

/**
 * `list` scope — imperative rows (registry `ignore`), bound in hooks/use-mail-navigation.ts
 * via react-hotkeys-hook because they need the live list container + repeat handling.
 */
export const LIST_IMPERATIVE_ACTIONS = [
  'focusNext',
  'focusPrevious',
  'openFocused',
  'closeList',
  'pageDown',
  'pageUp',
] as const;

/**
 * `compose` scope, registry `ignore` — bound OUTSIDE the hotkey system, inside the composer
 * (components/create/email-composer.tsx): `sendEmail` via the editor `onModEnter`, and
 * `sendAndArchive` (mod+shift+Enter) via a useHotkeys → send + archive the open thread.
 * Listed so the coverage test accounts for their external binding, not as unhandled.
 */
export const COMPOSER_EXTERNAL_ACTIONS = ['sendEmail', 'sendAndArchive'] as const;
