import { askRetaThreadCaptureAtom } from '@/components/copilot/ask-reta-state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { getDefaultStore } from 'jotai';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Tour 06 — intégration hotkey→surface : le VRAI composant GlobalHotkeys est
// monté (frontières lourdes en fakes) et ses handlers réellement enregistrés
// sont invoqués. Y fige le fil ouvert AU MOMENT de la frappe ; Cmd+J fige
// « aucun fil » — jamais d'héritage d'un vieux fil.

const harness = vi.hoisted(() => ({
  queryStore: {} as Record<string, string | null>,
  handlers: null as Record<string, () => void> | null,
}));

vi.mock('nuqs', () => ({
  useQueryState: (key: string) => [
    harness.queryStore[key] ?? null,
    (value: string | null) => {
      harness.queryStore[key] = value;
    },
  ],
}));

vi.mock('./use-hotkey-utils', () => ({
  useShortcuts: (_shortcuts: unknown, handlers: Record<string, () => void>) => {
    harness.handlers = handlers;
  },
}));

vi.mock('@/components/context/command-palette-context', () => ({
  useCommandPalette: () => ({ clearAllFilters: vi.fn() }),
  preloadCommandPalette: vi.fn(),
}));
vi.mock('@/components/copilot/ask-reta-button', () => ({ preloadAskRetaSurface: vi.fn() }));
vi.mock('@/components/create/compose-surface', () => ({ preloadComposeSurface: vi.fn() }));
vi.mock('@/hooks/use-optimistic-actions', () => ({
  useOptimisticActions: () => ({ undoLastAction: vi.fn() }),
}));
vi.mock('./ask-reta-hotkey-guard', () => ({ shouldOpenAskRetaFromHotkey: () => true }));
vi.mock('@/components/context/sidebar-context', () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));
vi.mock('@/config/shortcuts', () => ({ enhancedKeyboardShortcuts: [] }));

import { GlobalHotkeys } from './global-hotkeys';

let container: HTMLDivElement;
let root: Root;
const store = getDefaultStore();

const render = () => {
  act(() => {
    root.render(<GlobalHotkeys />);
  });
};

beforeEach(() => {
  harness.queryStore.threadId = null;
  harness.queryStore.isAskRetaOpen = null;
  harness.handlers = null;
  store.set(askRetaThreadCaptureAtom, null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('GlobalHotkeys — capture explicite du contexte de fil (tour 06)', () => {
  it('Y fige le threadId ouvert AU MOMENT de la frappe et ouvre le panneau', () => {
    harness.queryStore.threadId = 'thread-linear';
    render();
    act(() => {
      harness.handlers!.askRetaThread!();
    });
    expect(store.get(askRetaThreadCaptureAtom)).toEqual({ threadId: 'thread-linear' });
    expect(harness.queryStore.isAskRetaOpen).toBe('true');
  });

  it('Y sans fil ouvert fige une capture VIDE (pas de contexte inventé)', () => {
    render();
    act(() => {
      harness.handlers!.askRetaThread!();
    });
    expect(store.get(askRetaThreadCaptureAtom)).toEqual({ threadId: null });
  });

  it("Cmd+J fige « aucun fil » même quand un fil est ouvert — jamais d'héritage", () => {
    harness.queryStore.threadId = 'thread-linear';
    render();
    act(() => {
      harness.handlers!.askRetaOpen!();
    });
    expect(store.get(askRetaThreadCaptureAtom)).toEqual({ threadId: null });
    expect(harness.queryStore.isAskRetaOpen).toBe('true');
  });
});
