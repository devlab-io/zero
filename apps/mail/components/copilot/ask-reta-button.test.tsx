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
      root.render(<AskRetaButton />);
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
  });
});
