import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Tell React this is an act() environment so effects flush deterministically inside act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// #44 supervisor ruling 28fa0f01 — five palette-split contract tests + the fallback Escape window.
// Renders the REAL eager provider (happy-dom + react-dom/client + act) with the heavy dialog mocked
// so we can prove: (1) the dialog child mounts ONLY after ⌘/Ctrl+K (0 before), (2) the useCommandPalette
// contract, (3) storage-init → activeFilters + search sync, (4) clearAllFilters empties context +
// storage + search, (5) clear-on-pathname, and the loading-modal Escape closes during the load window.

// --- controllable shared state (hoisted so the vi.mock factories can read it) ---
const h = vi.hoisted(() => ({
  dialogMounts: 0,
  holdDialog: false,
  dialogPromise: null as null | Promise<void>,
  resolveDialog: null as null | (() => void),
  pathname: '/mail/inbox',
  storedFilters: null as null | { id: string; type: string; value: string; display: string }[],
  searchValue: { value: '', highlight: '', folder: 'inbox', isAISearching: false } as any,
  writes: [] as any[],
  cleared: 0,
}));

// Heavy dialog mocked. When h.holdDialog is set it SUSPENDS (throws a pending promise) so the
// provider's Suspense fallback (the loading modal) is actually rendered — that is what the fallback
// Escape test exercises. Otherwise it renders and increments a mount counter.
vi.mock('./command-palette-dialog', () => ({
  CommandPaletteDialog: (_props: Record<string, unknown>) => {
    if (h.holdDialog) throw h.dialogPromise;
    h.dialogMounts++;
    return null;
  },
}));

vi.mock('@/hooks/use-search-value', () => ({
  useSearchValue: () => {
    const set = (v: any) => {
      h.searchValue = typeof v === 'function' ? v(h.searchValue) : v;
    };
    return [h.searchValue, set];
  },
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: h.pathname }),
}));

vi.mock('./command-palette-storage', () => ({
  readActiveFilters: () => h.storedFilters,
  writeActiveFilters: (f: any) => h.writes.push(f),
  clearActiveFilters: () => {
    h.cleared++;
  },
}));

// Stateful nuqs mock: real React state per key, supports functional updaters (needed for the ⌘K toggle).
vi.mock('nuqs', async () => {
  const React = await import('react');
  return {
    useQueryState: (_key: string) => React.useState<string | null>(null),
  };
});

import { CommandPaletteProvider, useCommandPalette } from './command-palette-context';

let captured: { activeFilters: any[]; clearAllFilters: () => void } | null = null;
function Probe() {
  captured = useCommandPalette();
  return null;
}

let container: HTMLDivElement;
let root: Root;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <CommandPaletteProvider>
        <Probe />
      </CommandPaletteProvider>,
    );
  });
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

beforeEach(() => {
  h.dialogMounts = 0;
  h.holdDialog = false;
  h.dialogPromise = new Promise<void>((resolve) => {
    h.resolveDialog = resolve;
  });
  h.pathname = '/mail/inbox';
  h.storedFilters = null;
  h.searchValue = { value: '', highlight: '', folder: 'inbox', isAISearching: false };
  h.writes = [];
  h.cleared = 0;
  captured = null;
  localStorage.clear();
});

afterEach(async () => {
  // Release any suspended dialog (holdDialog off first so the retry renders instead of re-throwing),
  // flushing the promise-resolution retry inside act, then unmount — all wrapped so no update escapes.
  await act(async () => {
    h.holdDialog = false;
    h.resolveDialog?.();
  });
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('CommandPaletteProvider — split contracts (#44)', () => {
  it('contract: useCommandPalette exposes activeFilters + clearAllFilters', () => {
    render();
    expect(captured).not.toBeNull();
    expect(Array.isArray(captured!.activeFilters)).toBe(true);
    expect(typeof captured!.clearAllFilters).toBe('function');
  });

  it('contract: the heavy dialog is NOT mounted at rest, and mounts on ⌘/Ctrl+K', async () => {
    render();
    expect(h.dialogMounts).toBe(0); // cold: palette dialog chunk not rendered

    pressKey('k', { metaKey: true });
    await act(async () => {}); // flush the lazy import + suspense
    expect(h.dialogMounts).toBeGreaterThan(0); // opened → child rendered

    // Ctrl+K also works (toggle back closed → dialog unmounts, no new mount required)
    pressKey('k', { ctrlKey: true });
    await act(async () => {});
    // reopening mounts again
    pressKey('k', { ctrlKey: true });
    await act(async () => {});
    expect(h.dialogMounts).toBeGreaterThanOrEqual(2);
  });

  it('contract: storage-init restores persisted filters into context + search value', () => {
    h.storedFilters = [{ id: 'f1', type: 'search', value: 'from:x', display: 'From X' }];
    render();
    expect(captured!.activeFilters).toHaveLength(1);
    expect(captured!.activeFilters[0].id).toBe('f1');
    expect(h.searchValue.value).toBe('from:x'); // reflected into the shared search value
  });

  it('contract: clearAllFilters empties context, storage and search value', () => {
    h.storedFilters = [{ id: 'f1', type: 'search', value: 'from:x', display: 'From X' }];
    render();
    expect(captured!.activeFilters).toHaveLength(1);

    act(() => captured!.clearAllFilters());
    expect(captured!.activeFilters).toHaveLength(0);
    expect(h.cleared).toBeGreaterThan(0); // clearActiveFilters (localStorage) called
    expect(h.searchValue.value).toBe(''); // search reset
  });

  it('contract: a route change clears active filters', () => {
    h.storedFilters = [{ id: 'f1', type: 'search', value: 'from:x', display: 'From X' }];
    render();
    expect(captured!.activeFilters).toHaveLength(1);

    act(() => {
      h.pathname = '/settings/general';
      root.render(
        <CommandPaletteProvider>
          <Probe />
        </CommandPaletteProvider>,
      );
    });
    expect(captured!.activeFilters).toHaveLength(0);
  });

  it('fallback window: the loading modal is shown while the dialog suspends and Escape closes it', async () => {
    h.holdDialog = true; // keep the dialog suspended so the Suspense fallback stays mounted
    render();
    pressKey('k', { metaKey: true }); // open → dialog suspends → loading modal shown
    await act(async () => {});

    // PRESENT: the accessible loading modal is actually rendered during the load window.
    expect(document.querySelector('[role="dialog"][aria-label="Loading commands"]')).not.toBeNull();
    expect(h.dialogMounts).toBe(0); // still suspended, real child not mounted

    pressKey('Escape'); // the loading modal's own Escape handler closes the palette
    await act(async () => {});

    // ABSENT + closed: the fallback (and thus the palette) is gone.
    expect(document.querySelector('[role="dialog"][aria-label="Loading commands"]')).toBeNull();
  });
});
