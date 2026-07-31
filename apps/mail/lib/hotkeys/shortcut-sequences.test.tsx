import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShortcutSequences } from './use-hotkey-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { Shortcut } from '@/config/shortcuts';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// r18 : matrice des séquences `g …` — fenêtre bornée, annulation par Escape,
// inertes avec modificateur ou pendant la frappe, et la seconde touche est
// consommée (preventDefault : elle ne fuit jamais dans la page).

const sequenceRow = (second: string, action: string): Shortcut => ({
  keys: ['g', second],
  action,
  type: 'sequence',
  description: '',
  scope: 'navigation',
});

function Harness({ handlers }: { handlers: Record<string, () => void> }) {
  useShortcutSequences([sequenceRow('i', 'inbox'), sequenceRow('d', 'goToDrafts')], handlers);
  return null;
}

describe('useShortcutSequences — g puis touche', () => {
  let container: HTMLDivElement;
  let root: Root;
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const mount = (handlers: Record<string, () => void>) =>
    act(() => root.render(<Harness handlers={handlers} />));

  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  };

  it('g puis i dans la fenêtre : déclenche UNE fois et consomme la seconde touche', () => {
    const inbox = vi.fn();
    mount({ inbox, goToDrafts: vi.fn() });

    press('g');
    now = 300;
    const second = press('i');

    expect(inbox).toHaveBeenCalledTimes(1);
    // La touche d'ouverture de la destination ne fuit pas dans la page.
    expect(second.defaultPrevented).toBe(true);
  });

  it('fenêtre expirée : la séquence ne déclenche pas', () => {
    const inbox = vi.fn();
    mount({ inbox, goToDrafts: vi.fn() });

    press('g');
    now = 900; // > 800 ms
    press('i');
    expect(inbox).not.toHaveBeenCalled();
  });

  it('Escape entre g et i ANNULE la séquence en cours', () => {
    const inbox = vi.fn();
    mount({ inbox, goToDrafts: vi.fn() });

    press('g');
    now = 100;
    press('Escape');
    now = 200;
    press('i');
    expect(inbox).not.toHaveBeenCalled();
  });

  it('modificateur tenu : jamais une séquence (mod+g, puis g avec ctrl)', () => {
    const inbox = vi.fn();
    mount({ inbox, goToDrafts: vi.fn() });

    press('g', { metaKey: true });
    now = 100;
    press('i');
    expect(inbox).not.toHaveBeenCalled();
  });

  it('inerte pendant la frappe dans un champ éditable', () => {
    const inbox = vi.fn();
    mount({ inbox, goToDrafts: vi.fn() });
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    });
    now = 100;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }));
    });
    expect(inbox).not.toHaveBeenCalled();
    input.remove();
  });

  it('deux séquences distinctes routent vers leurs handlers respectifs', () => {
    const inbox = vi.fn();
    const goToDrafts = vi.fn();
    mount({ inbox, goToDrafts });

    press('g');
    now = 100;
    press('d');
    expect(goToDrafts).toHaveBeenCalledTimes(1);
    expect(inbox).not.toHaveBeenCalled();
  });
});
