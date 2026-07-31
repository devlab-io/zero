// TODO: Implement shortcuts syncing and caching
import { type Shortcut, keyboardShortcuts, enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { keyboardLayoutMapper, type KeyboardLayout } from '@/utils/keyboard-layout-map';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getKeyCodeFromKey } from '@/utils/keyboard-utils';
import { useHotkeys } from 'react-hotkeys-hook';
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

/**
 * Table de liaison PAR COMBINAISON (r18, revue Codex — bug central). L'ancien
 * reduce était indexé PAR ACTION : chaque alias écrasait le précédent, et
 * seule la DERNIÈRE ligne d'une action survivait dans le binder — `d` mort
 * (e gardé), `u` mort (shift+u gardé), `#` et `delete` morts (mod+backspace
 * gardé), `mod+k` et `mod+shift+k` morts (mod+shift+p gardé), `shift+?` mort
 * (mod+/ gardé)… pendant que l'aide annonçait toutes ces touches. Indexée par
 * combinaison : chaque alias est réellement lié ; une combinaison ne porte
 * qu'UNE ligne (première inscription gagne) et la résolution est un lookup
 * exact — un événement ne peut jamais déclencher deux handlers. Les lignes
 * `ignore` (liées ailleurs) et les séquences n'entrent jamais ici.
 */
export function buildComboBindings(
  shortcuts: Shortcut[],
  handlers: { [key: string]: (() => void) | undefined },
): Map<string, Shortcut> {
  const bindings = new Map<string, Shortcut>();
  for (const shortcut of shortcuts) {
    if (shortcut.type === 'sequence' || shortcut.ignore) continue;
    if (!handlers[shortcut.action]) continue;
    const combo = formatKeys(shortcut.keys);
    if (combo && !bindings.has(combo)) bindings.set(combo, shortcut);
  }
  return bindings;
}

export function useShortcuts(
  shortcuts: Shortcut[],
  handlers: { [key: string]: () => void },
  options: Partial<HotkeyOptions> = {},
) {
  // Sequences are driven separately (useShortcutSequences); the react-hotkeys-hook
  // binder only owns single keys and modifier chords — one row per COMBINATION.
  const comboBindings = useMemo(
    () => buildComboBindings(shortcuts, handlers),
    [shortcuts, handlers],
  );

  const shortcutString = useMemo(() => [...comboBindings.keys()].join(','), [comboBindings]);

  useHotkeys(
    shortcutString,
    (event: KeyboardEvent, hotkeysEvent) => {
      if (hotkeysEvent.keys?.includes('click')) {
        return;
      }
      const getModifierString = (e: typeof hotkeysEvent) => {
        const modifiers = [];
        if (e.meta) modifiers.push('meta');
        if (e.ctrl) modifiers.push('control');
        if (e.alt) modifiers.push('alt');
        if (e.shift) modifiers.push('shift');
        return modifiers.length > 0 ? modifiers.join('+') + '+' : '';
      };

      const pressedKeys = getModifierString(hotkeysEvent) + (hotkeysEvent.keys?.join('+') || '');

      const matching = comboBindings.get(pressedKeys);
      if (matching) {
        // A bare key must never fire while typing or inside a dialog. Modifier chords
        // (mod+…) are safe there and stay live (e.g. ⌘K to dismiss the palette).
        if (matching.type === 'single' && isTypingOrModalTarget(event.target)) {
          return;
        }
        const handlerFn = handlers[matching.action];
        if (handlerFn) {
          if (matching.preventDefault || options.preventDefault) {
            event.preventDefault();
          }
          handlerFn();
        }
      }
    },
    {
      ...options,
      scopes: options.scope ? [options.scope] : undefined,
      preventDefault: false, // We'll handle preventDefault per-shortcut
      enableOnContentEditable: false,
      enableOnFormTags: false,
      keyup: false,
      keydown: true,
    },
    [comboBindings, handlers, options],
  );
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
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingOrModalTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const now = performance.now();
      const current = pending.current;

      if (current && now - current.startedAt <= timeoutMs) {
        const match = sequenceShortcuts.find(
          (shortcut) => shortcut.keys[0] === current.key && shortcut.keys[1] === key,
        );
        pending.current = null;
        if (!match) return;
        event.preventDefault();
        handlers[match.action]?.();
        return;
      }

      const startsSequence = sequenceShortcuts.some((shortcut) => shortcut.keys[0] === key);
      pending.current = startsSequence ? { key, startedAt: now } : null;
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handlers, sequenceShortcuts, timeoutMs]);
}
