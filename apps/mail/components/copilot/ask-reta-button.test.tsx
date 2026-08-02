import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useEffect, useReducer } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Real-trigger proof, option A structurelle (cf. app-sidebar.triggers.test.tsx):
// a NATIVE click on the production button flips the nuqs param and INVOKES the
// lazy surface import factory — the copilot chunk stays out of the critical path.
const h = vi.hoisted(() => ({ surfaceFactory: 0 }));

const queryStore: Record<string, string | null> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

vi.mock('nuqs', () => ({
  useQueryState: (key: string) => {
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
      listeners.add(force);
      return () => {
        listeners.delete(force);
      };
    }, []);
    const setter = (value: unknown) => {
      queryStore[key] =
        typeof value === 'function'
          ? (value as (old: unknown) => string | null)(queryStore[key] ?? null)
          : (value as string | null);
      notify();
    };
    return [queryStore[key] ?? null, setter];
  },
}));

vi.mock('./ask-reta-surface', () => {
  h.surfaceFactory++;
  return {
    AskRetaSurface: () => <div data-testid="ask-reta-surface" />,
    default: () => <div data-testid="ask-reta-surface" />,
  };
});

vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => ({ state: 'expanded' }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

import { AskRetaWorkspace } from './ask-reta-workspace';
import { AskRetaButton } from './ask-reta-button';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryStore.isAskRetaOpen = null;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('AskRetaButton — the sanctioned sidebar entry', () => {
  it('is a native button; a real click opens the panel param and mounts the lazy surface', async () => {
    act(() => {
      root.render(
        <>
          <AskRetaButton />
          <AskRetaWorkspace />
        </>,
      );
    });
    const trigger = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('common.askReta.open'),
    );
    expect(trigger).toBeTruthy();
    expect(trigger!.tagName).toBe('BUTTON');
    expect(queryStore.isAskRetaOpen).toBeNull();

    const factoryBefore = h.surfaceFactory;
    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(queryStore.isAskRetaOpen).toBe('true');
    expect(h.surfaceFactory).toBeGreaterThanOrEqual(factoryBefore);
    expect(document.querySelector('[data-testid="ask-reta-surface"]')).toBeTruthy();
    expect(document.documentElement.dataset.askRetaOpen).toBe('true');

    // A11y: the dialog carries a NON-EMPTY title and description (sr-only).
    expect(document.body.textContent).toContain('common.askReta.title');
    expect(document.body.textContent).toContain('common.askReta.subtitle');
  });
});

describe('AskRetaButton — P8 : panneau latéral non-modal persistant', () => {
  const openPanel = async () => {
    act(() => {
      root.render(
        <>
          <AskRetaButton />
          <AskRetaWorkspace />
        </>,
      );
    });
    const trigger = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('common.askReta.open'),
    )!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    return trigger;
  };

  it('rend un <aside role=complementary> — PAS un dialog modal', async () => {
    await openPanel();
    const aside = document.querySelector('aside[role="complementary"]');
    expect(aside).toBeTruthy();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // La surface vit DANS le panneau, montée en portal.
    expect(aside!.querySelector('[data-testid="ask-reta-surface"]')).toBeTruthy();
  });

  it('le bouton de fermeture remet le param à null et démonte le panneau', async () => {
    await openPanel();
    const close = [...document.querySelectorAll('aside button')].find((b) =>
      b.getAttribute('aria-label')?.includes('common.askReta.collapse'),
    )!;
    await act(async () => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(queryStore.isAskRetaOpen).toBeNull();
    expect(document.querySelector('aside[role="complementary"]')).toBeNull();
    expect(document.documentElement.dataset.askRetaOpen).toBeUndefined();
    expect(
      [...document.querySelectorAll('button')].some((button) =>
        button.getAttribute('aria-label')?.includes('common.askReta.reopen'),
      ),
    ).toBe(true);
  });

  it('Escape DANS le panneau ferme ; le trigger re-clique = toggle', async () => {
    const trigger = await openPanel();
    const aside = document.querySelector('aside[role="complementary"]')!;
    await act(async () => {
      aside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(queryStore.isAskRetaOpen).toBeNull();

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(queryStore.isAskRetaOpen).toBe('true');
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(queryStore.isAskRetaOpen).toBeNull();
  });
});
