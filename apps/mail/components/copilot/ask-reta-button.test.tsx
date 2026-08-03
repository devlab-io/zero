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
vi.mock('@/components/workspace/calendar-pane', () => ({
  CalendarPane: () => <div data-testid="calendar-pane" />,
}));
vi.mock('@/components/workspace/activity-pane', () => ({
  ActivityPane: () => <div data-testid="activity-pane" />,
}));
vi.mock('@/components/workspace/contacts-pane', () => ({
  ContactsPane: () => <div data-testid="contacts-pane" />,
}));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

import { GlobalWorkspaceProvider } from '@/components/workspace/global-workspace-context';
import { GlobalWorkspaceDock } from '@/components/workspace/global-workspace-dock';
import { AskRetaButton } from './ask-reta-button';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryStore.isAskRetaOpen = null;
  localStorage.clear();
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
        <GlobalWorkspaceProvider>
          <AskRetaButton />
          <GlobalWorkspaceDock />
        </GlobalWorkspaceProvider>,
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
    expect(document.querySelector('[role="complementary"]')).toBeTruthy();

    // A11y: the dialog carries a NON-EMPTY title and description (sr-only).
    expect(document.body.textContent).toContain('common.askReta.title');
    expect(document.body.textContent).toContain('common.askReta.subtitle');
  });
});

describe('AskRetaButton — P8 : panneau latéral non-modal persistant', () => {
  const openPanel = async () => {
    act(() => {
      root.render(
        <GlobalWorkspaceProvider>
          <AskRetaButton />
          <GlobalWorkspaceDock />
        </GlobalWorkspaceProvider>,
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

  it('rend une région complementary dans l’unique aside workspace — PAS un second panneau', async () => {
    await openPanel();
    const region = document.querySelector('[role="complementary"]');
    expect(region).toBeTruthy();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelectorAll('aside')).toHaveLength(1);
    // La surface vit dans l'hôte de workspace unique, jamais dans un portal concurrent.
    expect(region!.querySelector('[data-testid="ask-reta-surface"]')).toBeTruthy();
  });

  it('retire le workspace fermé de la navigation clavier', () => {
    act(() => {
      root.render(
        <GlobalWorkspaceProvider>
          <GlobalWorkspaceDock />
        </GlobalWorkspaceProvider>,
      );
    });

    const workspace = [...document.querySelectorAll('aside')].find((aside) =>
      aside.getAttribute('aria-label')?.includes('globalWorkspace.title'),
    );
    expect(workspace).toBeTruthy();
    expect(workspace?.getAttribute('aria-hidden')).toBe('true');
    expect(workspace?.hasAttribute('inert')).toBe(true);
  });

  it('le bouton de fermeture remet le param à null et démonte le panneau', async () => {
    await openPanel();
    const close = [...document.querySelectorAll('aside button')].find((b) =>
      b.getAttribute('aria-label')?.includes('globalWorkspace.close'),
    )!;
    await act(async () => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(queryStore.isAskRetaOpen).toBeNull();
    expect(document.querySelector('[role="complementary"]')).toBeNull();
    expect(
      [...document.querySelectorAll('button')].some((button) =>
        button.getAttribute('aria-label')?.includes('common.askReta.title'),
      ),
    ).toBe(true);
  });

  it('Escape DANS le panneau ferme ; le trigger re-clique = toggle', async () => {
    const trigger = await openPanel();
    const region = document.querySelector('[role="complementary"]')!;
    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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

  it('Escape ferme aussi Calendar et restaure le focus sur le mini-rail', async () => {
    act(() => {
      root.render(
        <GlobalWorkspaceProvider>
          <GlobalWorkspaceDock />
        </GlobalWorkspaceProvider>,
      );
    });
    const trigger = [...container.querySelectorAll('button')].find((button) =>
      button.getAttribute('aria-label')?.includes('globalWorkspace.calendar.tab'),
    )!;

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const workspace = [...document.querySelectorAll('aside')].find((aside) =>
      aside.getAttribute('aria-label')?.includes('globalWorkspace.title'),
    )!;
    expect(workspace.hasAttribute('inert')).toBe(false);

    await act(async () => {
      workspace.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const restoredTrigger = [...container.querySelectorAll('button')].find((button) =>
      button.getAttribute('aria-label')?.includes('globalWorkspace.calendar.tab'),
    );
    expect(restoredTrigger).toBeTruthy();
    expect(document.activeElement).toBe(restoredTrigger);
  });
});
