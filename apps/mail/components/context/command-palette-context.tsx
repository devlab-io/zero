import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { memoizedImport } from '@/lib/memoized-import';
import { getMainSearchTerm } from '@/lib/utils';
import { useSearchValue } from '@/hooks/use-search-value';
import { useLocation } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { type ActiveFilter } from './command-registry';
import {
  clearActiveFilters,
  readActiveFilters,
  writeActiveFilters,
} from './command-palette-storage';

// #44 (gate A8): the heavy palette body (state, command/search logic, cmdk CommandDialog + views
// with the react-day-picker calendar) is dynamic-imported only when the palette is open. This
// lightweight provider stays eager and keeps the always-needed surface out of the lazy chunk:
// activeFilters + clearAllFilters (read by mail/nav-main via context), addFilter/removeFilter, the
// persisted-filter restore on mount, the clear-on-route-change, and the ⌘/Ctrl+K open toggle (which
// therefore works before the dialog chunk has loaded).
// Single dynamic-import invocation, shared by React.lazy and the warm below: the memoized
// promise guarantees the dialog module is only ever requested once, whichever of the warm
// or the lazy render fires first (concurrent first-time imports of the same module also
// race vitest's mock interception — one invocation removes the race everywhere). The
// memoizer resets on rejection, so a transient warm failure never pins a dead promise
// onto a later lazy render (revue Codex 2026-07-30).
const loadPaletteDialog = memoizedImport(() => import('./command-palette-dialog'));
const CommandPaletteDialog = lazy(() =>
  loadPaletteDialog().then((mod) => ({ default: mod.CommandPaletteDialog })),
);

// CUA 2026-07-30: ⌘K paid the cold two-layer waterfall (dialog chunk, then the views chunk
// with cmdk + react-day-picker) as a 0.62–1.41 s spinner. Warm both layers with a runtime
// prefetch — fired on post-boot idle and again at the opening keystroke (no-op once loaded).
// Chunk composition (gate A8) is untouched: these stay dynamic imports.
let paletteWarmed = false;
export function preloadCommandPalette() {
  if (paletteWarmed) return;
  paletteWarmed = true;
  // Best-effort warm: it must never break its caller (the ⌘K open path). A failed fetch
  // rejects the promise; some environments (vitest module runner) can even throw the
  // dynamic import synchronously — both are swallowed and the warm re-armed for retry.
  try {
    void Promise.all([
      loadPaletteDialog(),
      import('./command-palette-views'),
      import('./command-palette-filter-view'),
    ]).catch(() => {
      paletteWarmed = false;
    });
  } catch {
    paletteWarmed = false;
  }
}

type CommandPaletteContext = {
  activeFilters: ActiveFilter[];
  clearAllFilters: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContext | null>(null);

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider.');
  }
  return context;
}

// Real, visible, accessible modal shown while the palette dialog chunk resolves after ⌘K (not an
// empty Suspense) — a top-centred card + named spinner, positioned like the palette itself. It
// installs its OWN Escape handler for the brief load window so Escape still closes the palette
// before the dialog chunk (which owns Escape → view→main / close) has mounted. The handler lives
// only while this fallback is mounted, so it never coexists with the dialog's Escape handling.
function CommandPaletteLoadingModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, { capture: true });
    return () => document.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Loading commands"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[20vh]"
    >
      <div className="flex h-32 w-[min(90vw,640px)] items-center justify-center rounded-xl border bg-white shadow-lg dark:border-none dark:bg-[#1c1c1c]">
        <Loader2 aria-hidden="true" className="text-muted-foreground h-5 w-5 animate-spin" />
        <span className="sr-only">Loading commands</span>
      </div>
    </div>
  );
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useQueryState('isCommandPaletteOpen');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [searchValue, setSearchValue] = useSearchValue();
  const { pathname } = useLocation();

  // Restore persisted filters on mount and reflect them into the shared search value. Eager so a
  // returning user's active filters are applied without opening the palette.
  useEffect(() => {
    const filters = readActiveFilters();
    if (filters) {
      setActiveFilters(filters);
      const query = filters.map((f) => f.value).join(' ');
      if (query) {
        setSearchValue({
          ...searchValue,
          value: query,
          highlight: getMainSearchTerm(query),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
    clearActiveFilters();
    setSearchValue({
      value: '',
      highlight: '',
      folder: searchValue.folder,
      isAISearching: false,
    });
  }, [searchValue.folder, setSearchValue]);

  const addFilter = useCallback((filter: ActiveFilter) => {
    setActiveFilters((prev) => {
      const updated = [...prev.filter((f) => f.type !== filter.type), filter];
      writeActiveFilters(updated);
      return updated;
    });
  }, []);

  const removeFilter = useCallback((filterId: string) => {
    setActiveFilters((prev) => {
      const updated = prev.filter((f) => f.id !== filterId);
      writeActiveFilters(updated);
      return updated;
    });
  }, []);

  const closePalette = useCallback(() => setOpen(null), [setOpen]);

  useEffect(() => {
    if (pathname && activeFilters.length) {
      clearAllFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ⌘/Ctrl+K toggles the palette open. Eager (functional setter, no `open` dependency) so it works
  // before the dialog chunk is loaded. The keystroke also fires the chunk warm — the earliest
  // possible fetch start when the idle warm has not run yet, a no-op otherwise.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        preloadCommandPalette();
        setOpen((prevOpen) => (prevOpen ? null : 'true'));
      }
    };

    document.addEventListener('keydown', down, { capture: true });
    return () => document.removeEventListener('keydown', down, { capture: true });
  }, [setOpen]);

  // CUA 2026-07-30: warm the palette chunks once the boot path is idle so the first ⌘K
  // opens without any visible spinner. Idle-time network prefetch only.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const warm = () => preloadCommandPalette();
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timerId = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <CommandPaletteContext.Provider
      value={{
        activeFilters,
        clearAllFilters,
      }}
    >
      {open ? (
        <Suspense fallback={<CommandPaletteLoadingModal onClose={closePalette} />}>
          <CommandPaletteDialog
            open={open}
            setOpen={setOpen}
            activeFilters={activeFilters}
            addFilter={addFilter}
            removeFilter={removeFilter}
            clearAllFilters={clearAllFilters}
          />
        </Suspense>
      ) : null}
      {children}
    </CommandPaletteContext.Provider>
  );
}
