import {
  clearActiveFilters,
  readActiveFilters,
  writeActiveFilters,
} from './command-palette-storage';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import useSearchLabels, { clearMailQueryFilters } from '@/hooks/use-labels-search';
import { useSearchValue } from '@/hooks/use-search-value';
import { type ActiveFilter } from './command-registry';
import { getMainSearchTerm } from '@/lib/utils';
import { useLocation } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useQueryState } from 'nuqs';

// #44 (gate A8): the heavy palette body (state, command/search logic, cmdk CommandDialog + views
// with the react-day-picker calendar) is dynamic-imported only when the palette is open. This
// lightweight provider stays eager and keeps the always-needed surface out of the lazy chunk:
// activeFilters + clearAllFilters (read by mail/nav-main via context), addFilter/removeFilter, the
// persisted-filter restore on mount, the clear-on-route-change, and the ⌘/Ctrl+K open toggle (which
// therefore works before the dialog chunk has loaded).
const CommandPaletteDialog = lazy(() =>
  import('./command-palette-dialog').then((mod) => ({ default: mod.CommandPaletteDialog })),
);

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
  const { setLabels } = useSearchLabels();
  const [, setCategory] = useQueryState('category');
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
    clearMailQueryFilters({ setLabels, setCategory });
    setSearchValue({
      value: '',
      highlight: '',
      folder: searchValue.folder,
      isAISearching: false,
    });
  }, [searchValue.folder, setCategory, setLabels, setSearchValue]);

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
  // before the dialog chunk is loaded.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prevOpen) => (prevOpen ? null : 'true'));
      }
    };

    document.addEventListener('keydown', down, { capture: true });
    return () => document.removeEventListener('keydown', down, { capture: true });
  }, [setOpen]);

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
