// TODO: Implement shortcuts syncing and caching
import { type Shortcut, keyboardShortcuts, enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { keyboardLayoutMapper, type KeyboardLayout } from '@/utils/keyboard-layout-map';
import { getKeyCodeFromKey } from '@/utils/keyboard-utils';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isMac } from '@/lib/platform';

export const useShortcutCache = () => {
  // const { data: shortcuts, mutate } = useSWR<Shortcut[]>(
  //   userId ? `/hotkeys/${userId}` : null,
  //   () => axios.get('/api/v1/shortcuts').then((res) => res.data),
  //   {
  //     dedupingInterval: 24 * 60 * 60 * 1000,
  //   },
  // );

  // const updateShortcut = useCallback(
  //   async (shortcut: Shortcut) => {
  //     const currentShortcuts = shortcuts;
  //     const index = currentShortcuts?.findIndex((s) => s.action === shortcut.action);

  //     let newShortcuts: Shortcut[];
  //     if (index >= 0) {
  //       newShortcuts = [
  //         ...currentShortcuts?.slice(0, index),
  //         shortcut,
  //         ...currentShortcuts?.slice(index + 1),
  //       ];
  //     } else {
  //       newShortcuts = [...currentShortcuts, shortcut];
  //     }

  //     try {
  //       // Update server using server action
  //       await updateShortcuts(newShortcuts);
  //       // Update cache only after successful server update
  //       await mutate(newShortcuts, false);
  //     } catch (error) {
  //       throw error;
  //     }
  //   },
  //   [shortcuts, mutate],
  // );

  return {
    shortcuts: keyboardShortcuts,
    // updateShortcut,
  };
};

const dvorakToQwerty: Record<string, string> = {
  a: 'a',
  b: 'x',
  c: 'j',
  d: 'e',
  e: '.',
  f: 'u',
  g: 'i',
  h: 'd',
  i: 'c',
  j: 'h',
  k: 't',
  l: 'n',
  m: 'm',
  n: 'b',
  o: 'r',
  p: 'l',
  q: "'",
  r: 'p',
  s: 'o',
  t: 'k',
  u: 'g',
  v: 'q',
  w: ',',
  x: 'z',
  y: 'f',
  z: ';',
  ';': 's',
  "'": '-',
  ',': 'w',
  '.': 'v',
  '/': 'z',
  '-': '[',
  '[': '/',
  ']': '=',
  '=': ']',
};

const qwertyToDvorak: Record<string, string> = Object.entries(dvorakToQwerty).reduce(
  (acc, [dvorak, qwerty]) => {
    acc[qwerty] = dvorak;
    return acc;
  },
  {} as Record<string, string>,
);

export const formatKeys = (keys: string[] | undefined): string => {
  if (!keys || !keys.length) return '';

  const mapKey = (key: string) => {
    const lowerKey = key.toLowerCase();

    // Use enhanced keyboard layout mapping
    const detectedLayout = keyboardLayoutMapper.getDetectedLayout();
    let mappedKey = key;

    if (detectedLayout?.layout === 'dvorak') {
      // Use the existing Dvorak mapping for backward compatibility
      mappedKey = qwertyToDvorak[lowerKey] || key;
    } else if (detectedLayout?.layout && detectedLayout.layout !== 'qwerty') {
      // Use the KeyboardLayoutMap API for other layouts
      const keyCode = getKeyCodeFromKey(key);
      mappedKey = keyboardLayoutMapper.getKeyForCode(keyCode);
    }

    switch (mappedKey) {
      case 'mod':
        return isMac ? 'meta' : 'control';
      case '⌘':
        return 'meta';
      case '#':
        return 'shift+3';
      case '!':
        return 'shift+1';
      default:
        return mappedKey;
    }
  };

  if (keys.length > 1) {
    return keys.map(mapKey).join('+');
  }

  const firstKey = keys[0];
  if (!firstKey) return '';
  return mapKey(firstKey);
};

/**
 * Convert a key string to its corresponding KeyCode for the keyboard layout mapper
 */

export const formatDisplayKeys = (keys: string[]): string[] => {
  return keys.map((key) => {
    const lowerKey = key.toLowerCase();

    // Use enhanced keyboard layout mapping
    const detectedLayout = keyboardLayoutMapper.getDetectedLayout();
    let mappedKey = key;

    if (detectedLayout?.layout === 'dvorak') {
      // Use the existing Dvorak mapping for backward compatibility
      mappedKey = qwertyToDvorak[lowerKey] || key;
    } else if (detectedLayout?.layout && detectedLayout.layout !== 'qwerty') {
      // Use the KeyboardLayoutMap API for other layouts
      const keyCode = getKeyCodeFromKey(key);
      mappedKey = keyboardLayoutMapper.getKeyForCode(keyCode);
    }

    switch (mappedKey) {
      case 'mod':
        return isMac ? '⌘' : 'Ctrl';
      case 'meta':
        return '⌘';
      case 'control':
        return 'Ctrl';
      case 'shift':
        return '⇧';
      case 'alt':
        return isMac ? '⌥' : 'Alt';
      case 'enter':
        return '↵';
      case 'escape':
        return 'Esc';
      case 'backspace':
        return '⌫';
      case 'delete':
        return '⌦';
      case 'space':
        return 'Space';
      case 'click':
        return 'Click';
      default:
        return mappedKey.length === 1 ? mappedKey.toUpperCase() : mappedKey;
    }
  });
};

/**
 * Enhanced shortcut utilities with layout mapping support, here incase needed
 */
export const useEnhancedShortcuts = () => {
  const layoutInfo = keyboardLayoutMapper.getDetectedLayout();

  const getShortcutsForLayout = useCallback((layout: KeyboardLayout) => {
    return enhancedKeyboardShortcuts.map((shortcut) => ({
      ...shortcut,
      mappedKeys: shortcut.keys.map((key) =>
        keyboardLayoutMapper.convertKey(key, 'qwerty', layout),
      ),
    }));
  }, []);

  return {
    layoutInfo,
    formatKeysWithLayout: (keys: string[], targetLayout?: KeyboardLayout) => {
      if (!targetLayout || !layoutInfo) return formatKeys(keys);

      return keys
        .map((key) => {
          return keyboardLayoutMapper.convertKey(key, layoutInfo.layout, targetLayout);
        })
        .join('+');
    },
    getShortcutsForLayout,
  };
};

export type HotkeyOptions = {
  scope: string;
  preventDefault?: boolean;
  keydown?: boolean;
  keyup?: boolean;
};

export const defaultHotkeyOptions: HotkeyOptions = {
  scope: 'global',
  preventDefault: false,
  keydown: true,
  keyup: false,
};

export function useShortcut(
  shortcut: Shortcut,
  callback: () => void,
  options: Partial<HotkeyOptions> = {},
) {
  // const { updateShortcut } = useShortcutCache();
  const { scope, preventDefault, ...restOptions } = {
    ...defaultHotkeyOptions,
    ...options,
    ...shortcut,
  };

  // useCallback(() => {
  //   updateShortcut(shortcut);
  // }, [shortcut, updateShortcut])();

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (shortcut.preventDefault || preventDefault) {
        event.preventDefault();
      }
      callback();
    },
    [callback, preventDefault, shortcut],
  );

  useHotkeys(
    formatKeys(shortcut.keys),
    handleKey,
    {
      ...restOptions,
      scopes: [scope],
      preventDefault: shortcut.preventDefault || preventDefault,
    },
    [handleKey],
  );
}

/**
 * True when the event target is somewhere single-key shortcuts must never fire:
 * a text input / textarea / select, a contenteditable node (this is what TipTap /
 * ProseMirror render), or anywhere inside an open dialog. Pure and exported so the
 * keyboard-parity check can unit-test the exclusion rule directly.
 */
export function isTypingOrModalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    !!target.closest('[contenteditable="true"], [role="dialog"]')
  );
}

type ShortcutHandlers = Record<string, (() => void) | undefined>;
export type PendingShortcutSequence = { key: string; startedAt: number } | null;

const modifierKeys = new Set(['mod', 'meta', 'ctrl', 'control', 'alt', 'shift']);

function isAltGraphProducedPunctuation(event: KeyboardEvent, key: string): boolean {
  if (event.metaKey || event.shiftKey || !event.ctrlKey || !event.altKey) return false;
  if (key.length !== 1 || /[a-z0-9]/i.test(key) || event.key.toLowerCase() !== key) return false;

  // Chromium and Firefox expose AltGr differently: some report AltGraph, while
  // others expose the same layout-produced character as Ctrl+Alt. Restrict the
  // fallback to the reported punctuation character so Ctrl/Alt letter, digit,
  // and command chords cannot claim a bare shortcut.
  return event.getModifierState('AltGraph') || (event.ctrlKey && event.altKey);
}

function shortcutMatchesEvent(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const keys = shortcut.keys.map((key) => key.toLowerCase());
  const expected = new Set(keys.filter((key) => modifierKeys.has(key)));
  const expectsMod = expected.has('mod');
  const expectsMeta = expectsMod || expected.has('meta');
  const expectsCtrl = expectsMod || expected.has('ctrl') || expected.has('control');
  const hasMod = event.metaKey || event.ctrlKey;
  const key = keys.find((candidate) => !modifierKeys.has(candidate));
  if (!key) return false;
  const usesAltGraphPunctuation = !expected.size && isAltGraphProducedPunctuation(event, key);

  if (expectsMod ? !hasMod : (event.metaKey || event.ctrlKey) && !usesAltGraphPunctuation) return false;
  if (!expectsMod && !usesAltGraphPunctuation && (expectsMeta !== event.metaKey || expectsCtrl !== event.ctrlKey)) return false;
  const eventKey = event.key.toLowerCase();
  // Shift and AltGr are part of producing punctuation on common layouts. A bare
  // punctuation row therefore accepts them only when the browser already reports
  // the canonical punctuation character; letter and digit rows remain exact.
  const allowsLayoutModifier =
    !expected.has('alt') &&
    !expected.has('shift') &&
    key.length === 1 &&
    !/[a-z0-9]/i.test(key) &&
    eventKey === key;
  // A modified event must not fall through to a bare-key alias. For example,
  // Shift+U must select the `shift+u` row, never the preceding `u` row.
  if (!allowsLayoutModifier && expected.has('alt') !== event.altKey) return false;
  if (!allowsLayoutModifier && expected.has('shift') !== event.shiftKey) return false;

  if (key === 'space') return eventKey === ' ' || event.code === 'Space';
  return eventKey === key || event.code.toLowerCase() === key;
}

/**
 * Dispatch a browser KeyboardEvent against the canonical registry without parsing
 * punctuation into a hotkey string. `key`, `code`, and modifiers remain separate
 * event fields, so QWERTY and AZERTY punctuation reach the same advertised action.
 */
export function dispatchShortcutEvent(
  event: KeyboardEvent,
  shortcuts: Shortcut[],
  handlers: ShortcutHandlers,
  target: EventTarget | null = event.target,
): boolean {
  for (const shortcut of shortcuts) {
    if (shortcut.ignore || shortcut.type === 'sequence' || !handlers[shortcut.action]) continue;
    if (!shortcutMatchesEvent(event, shortcut)) continue;
    if (shortcut.type === 'single' && shortcut.keys[0]?.toLowerCase() !== 'escape' && isTypingOrModalTarget(target)) {
      return false;
    }
    if (shortcut.preventDefault) event.preventDefault();
    handlers[shortcut.action]?.();
    return true;
  }
  return false;
}

export function dispatchShortcutSequenceEvent(
  event: KeyboardEvent,
  shortcuts: Shortcut[],
  handlers: ShortcutHandlers,
  pending: PendingShortcutSequence,
  now: number,
  timeoutMs: number,
): PendingShortcutSequence {
  const key = event.key.toLowerCase();
  // AltGr is required to produce `#` on AZERTY. Browsers may expose it as
  // Ctrl+Alt, which is accepted only for the already-produced punctuation.
  if (event.defaultPrevented || event.metaKey || (event.ctrlKey && !isAltGraphProducedPunctuation(event, key))) return null;
  if (isTypingOrModalTarget(event.target)) return null;

  if (pending && now - pending.startedAt <= timeoutMs) {
    const match = shortcuts.find(
      (shortcut) => shortcut.keys[0] === pending.key && shortcut.keys[1] === key,
    );
    if (match) {
      event.preventDefault();
      handlers[match.action]?.();
    }
    return null;
  }

  return shortcuts.some((shortcut) => shortcut.keys[0] === key) ? { key, startedAt: now } : null;
}

export function useShortcuts(
  shortcuts: Shortcut[],
  handlers: { [key: string]: () => void },
  options: Partial<HotkeyOptions> = {},
) {
  const { activeScopes } = useHotkeysContext();
  const scope = options.scope;

  useEffect(() => {
    if (scope && !activeScopes.includes(scope)) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const handled = dispatchShortcutEvent(event, shortcuts, handlers);
      if (handled && options.preventDefault) event.preventDefault();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeScopes, handlers, options.preventDefault, scope, shortcuts]);
}

/**
 * Timed two-key sequences (`g` then a letter). A press starts a window; a second key
 * within `timeoutMs` fires the matching sequence. Never a simultaneous chord, and
 * inert while typing, inside a dialog, or when a modifier is held.
 */
export function useShortcutSequences(
  shortcuts: Shortcut[],
  handlers: Record<string, () => void>,
  timeoutMs = 800,
) {
  const pending = useRef<{ key: string; startedAt: number } | null>(null);
  const sequenceShortcuts = useMemo(
    () => shortcuts.filter((shortcut) => shortcut.type === 'sequence' && handlers[shortcut.action]),
    [shortcuts, handlers],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = performance.now();
      pending.current = dispatchShortcutSequenceEvent(
        event,
        sequenceShortcuts,
        handlers,
        pending.current,
        now,
        timeoutMs,
      );
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handlers, sequenceShortcuts, timeoutMs]);
}
