import { buildComboBindings, formatKeys, useShortcuts } from './use-hotkey-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyboardShortcuts, type Shortcut } from '@/config/shortcuts';
import { createRoot, type Root } from 'react-dom/client';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// r18 (revue Codex — bug central) : l'ancien binder réduisait les lignes PAR
// ACTION — tous les alias sauf le dernier étaient écrasés : d mort (e gardé),
// u mort (shift+u gardé), #/delete morts (mod+backspace gardé), mod+k et
// mod+shift+k morts (mod+shift+p gardé), shift+? mort (mod+/ gardé) — pendant
// que l'aide annonçait toutes ces touches. La table est désormais indexée par
// COMBINAISON ; chaque alias déclenche, une seule fois.

const row = (
  keys: string[],
  action: string,
  type: Shortcut['type'] = 'single',
  extra: Partial<Shortcut> = {},
): Shortcut => ({ keys, action, type, description: '', scope: 'test', ...extra });

describe('buildComboBindings — chaque alias est réellement lié', () => {
  const handlers = { archive: () => {}, palette: () => {}, unread: () => {} };

  it('conserve TOUTES les combinaisons d’une même action (régression du reduce par action)', () => {
    const bindings = buildComboBindings(
      [
        row(['d'], 'archive'),
        row(['e'], 'archive'),
        row(['mod', 'k'], 'palette', 'combination'),
        row(['mod', 'shift', 'k'], 'palette', 'combination'),
        row(['mod', 'shift', 'p'], 'palette', 'combination'),
        row(['u'], 'unread'),
        row(['shift', 'u'], 'unread', 'combination'),
      ],
      handlers,
    );

    const combos = [...bindings.keys()];
    for (const expected of [
      'd',
      'e',
      formatKeys(['mod', 'k']),
      formatKeys(['mod', 'shift', 'k']),
      formatKeys(['mod', 'shift', 'p']),
      'u',
      formatKeys(['shift', 'u']),
    ]) {
      expect(combos).toContain(expected);
    }
    expect(bindings.get('d')?.action).toBe('archive');
    expect(bindings.get('e')?.action).toBe('archive');
  });

  it('une même combinaison ne porte qu’UNE ligne (première inscription gagne — zéro double handler)', () => {
    const bindings = buildComboBindings([row(['d'], 'archive'), row(['d'], 'unread')], {
      archive: () => {},
      unread: () => {},
    });
    expect(bindings.size).toBe(1);
    expect(bindings.get('d')?.action).toBe('archive');
  });

  it('exclut séquences, lignes ignore et actions sans handler', () => {
    const bindings = buildComboBindings(
      [
        row(['g', 'i'], 'archive', 'sequence'),
        row(['x'], 'archive', 'single', { ignore: true }),
        row(['y'], 'inconnu'),
        row(['d'], 'archive'),
      ],
      handlers,
    );
    expect([...bindings.keys()]).toEqual(['d']);
  });

  it('registre réel : les alias thread-display historiquement morts sont tous liés', () => {
    const threadRows = keyboardShortcuts.filter((shortcut) => shortcut.scope === 'thread-display');
    const allHandled = Object.fromEntries(threadRows.map((r) => [r.action, () => {}]));
    const combos = [...buildComboBindings(threadRows, allHandled).keys()];

    for (const keys of [
      ['d'],
      ['e'],
      ['b'],
      ['h'],
      ['u'],
      ['shift', 'u'],
      ['#'],
      ['delete'],
      ['mod', 'backspace'],
      ['['],
      [']'],
      ['mod', 'c'],
      ['ctrl', 'c'],
    ]) {
      expect(combos).toContain(formatKeys(keys));
    }
  });

  it('registre réel : les trois palettes ET tous les alias d’aide sont liés en global', () => {
    const globalRows = keyboardShortcuts.filter((shortcut) => shortcut.scope === 'global');
    const allHandled = Object.fromEntries(globalRows.map((r) => [r.action, () => {}]));
    const combos = [...buildComboBindings(globalRows, allHandled).keys()];

    for (const keys of [
      ['mod', 'k'],
      ['mod', 'shift', 'k'],
      ['mod', 'shift', 'p'],
      ['shift', '?'],
      ['shift', '/'],
      ['mod', '/'],
      ['mod', 'z'],
      ['z'],
    ]) {
      expect(combos).toContain(formatKeys(keys));
    }
  });
});

// Intégration réelle (react-hotkeys-hook + jsdom) : chaque alias déclenche le
// handler EXACTEMENT une fois par frappe — jamais zéro (bug historique), jamais
// deux (même combinaison dupliquée).
describe('useShortcuts — un déclenchement par frappe pour chaque alias', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function Harness({
    shortcuts,
    handlers,
  }: {
    shortcuts: Shortcut[];
    handlers: Record<string, () => void>;
  }) {
    useShortcuts(shortcuts, handlers, { scope: 'test' });
    return null;
  }

  const mount = (node: React.ReactElement) => act(() => root.render(node));
  const press = (init: KeyboardEventInit) =>
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    });

  it('d ET e déclenchent archive, une fois chacun ; u et shift+u déclenchent unread', () => {
    const archive = vi.fn();
    const unread = vi.fn();
    mount(
      <HotkeysProvider initiallyActiveScopes={['test']}>
        <Harness
          shortcuts={[
            row(['d'], 'archive'),
            row(['e'], 'archive'),
            row(['u'], 'unread'),
            row(['shift', 'u'], 'unread', 'combination'),
          ]}
          handlers={{ archive, unread }}
        />
      </HotkeysProvider>,
    );

    press({ key: 'd', code: 'KeyD' });
    expect(archive).toHaveBeenCalledTimes(1);
    press({ key: 'e', code: 'KeyE' });
    expect(archive).toHaveBeenCalledTimes(2);

    press({ key: 'u', code: 'KeyU' });
    expect(unread).toHaveBeenCalledTimes(1);
    press({ key: 'U', code: 'KeyU', shiftKey: true });
    expect(unread).toHaveBeenCalledTimes(2);
    // Aucune fuite croisée.
    expect(archive).toHaveBeenCalledTimes(2);
  });

  it('les trois alias palette (mod+k / mod+shift+k / mod+shift+p) déclenchent chacun une fois', () => {
    const palette = vi.fn();
    mount(
      <HotkeysProvider initiallyActiveScopes={['test']}>
        <Harness
          shortcuts={[
            row(['mod', 'k'], 'palette', 'combination'),
            row(['mod', 'shift', 'k'], 'palette', 'combination'),
            row(['mod', 'shift', 'p'], 'palette', 'combination'),
          ]}
          handlers={{ palette }}
        />
      </HotkeysProvider>,
    );

    // jsdom n'est pas macOS : mod = control (formatKeys).
    press({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(palette).toHaveBeenCalledTimes(1);
    press({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(palette).toHaveBeenCalledTimes(2);
    press({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true });
    expect(palette).toHaveBeenCalledTimes(3);
  });

  it('une touche nue ne déclenche jamais depuis un champ éditable ; un chord y reste actif', () => {
    const archive = vi.fn();
    const palette = vi.fn();
    mount(
      <HotkeysProvider initiallyActiveScopes={['test']}>
        <Harness
          shortcuts={[row(['d'], 'archive'), row(['mod', 'k'], 'palette', 'combination')]}
          handlers={{ archive, palette }}
        />
      </HotkeysProvider>,
    );
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true }));
    });
    expect(archive).not.toHaveBeenCalled();

    input.remove();
  });
});
