import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, type NavigateFunction } from 'react-router';
import { createRoot, type Root } from 'react-dom/client';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { act, useEffect, useState } from 'react';

import type { CommandPaletteViewProps } from './command-palette-views';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type QueryValue = string | null;
type QueryUpdater = QueryValue | ((previous: QueryValue) => QueryValue);
type QueryListener = (value: QueryValue) => void;

const queryStore = vi.hoisted(() => ({
  values: new Map<string, QueryValue>(),
  listeners: new Map<string, Set<QueryListener>>(),
  writes: [] as Array<{ key: string; value: QueryValue }>,
}));

function publishQueryValue(key: string, value: QueryValue) {
  queryStore.values.set(key, value);
  queryStore.writes.push({ key, value });
  for (const listener of queryStore.listeners.get(key) ?? []) listener(value);
}

vi.mock('nuqs', async () => {
  const React = await import('react');
  return {
    useQueryState: (key: string) => {
      const [value, setValue] = React.useState<QueryValue>(queryStore.values.get(key) ?? null);

      React.useEffect(() => {
        const listeners = queryStore.listeners.get(key) ?? new Set<QueryListener>();
        listeners.add(setValue);
        queryStore.listeners.set(key, listeners);
        return () => {
          listeners.delete(setValue);
        };
      }, [key]);

      const update = React.useCallback(
        (next: QueryUpdater) => {
          const previous = queryStore.values.get(key) ?? null;
          publishQueryValue(key, typeof next === 'function' ? next(previous) : next);
        },
        [key],
      );

      return [value, update] as const;
    },
  };
});

type CommandInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  onValueChange?: (value: string) => void;
};

vi.mock('@/components/ui/command', () => ({
  CommandDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button data-command-item type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  CommandInput: ({ onValueChange, ...props }: CommandInputProps) => (
    <input
      {...props}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
      aria-label={props.placeholder}
    />
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/dialog', () => ({
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('@/components/ui/separator', () => ({ Separator: () => null }));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('../ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const testSpies = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: testSpies.toastError } }));
vi.mock('@/hooks/use-threads', () => ({ useThreads: () => [{}, []] }));
vi.mock('@/hooks/use-labels', () => ({ useLabels: () => ({ userLabels: [] }) }));
vi.mock('@/providers/query-provider', () => ({
  useTRPC: () => ({ ai: { generateSearchQuery: { mutationOptions: () => ({}) } } }),
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ query: '' }) }),
}));
vi.mock('@/hooks/use-search-value', async () => {
  const React = await import('react');
  return {
    useSearchValue: () =>
      React.useState({
        value: '',
        highlight: '',
        folder: 'inbox',
        isAISearching: false,
      }),
  };
});
vi.mock('@/components/context/command-palette-context', () => ({
  useCommandPalette: () => ({ clearAllFilters: vi.fn() }),
}));
vi.mock('@/components/context/sidebar-context', () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));
vi.mock('@/hooks/use-optimistic-actions', () => ({
  useOptimisticActions: () => ({ undoLastAction: vi.fn() }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@/app/(routes)/settings/shortcuts/contextual-shortcut-sheet', () => ({
  ContextualShortcutSheet: () => null,
}));

import useSearchLabels, {
  clearMailQueryFilters,
  hasActiveMailFilters,
} from '@/hooks/use-labels-search';
import { GlobalHotkeys } from '@/lib/hotkeys/global-hotkeys';
import { SearchView } from './command-palette-views';
import { useQueryState } from 'nuqs';

let container: HTMLDivElement;
let root: Root;

function makeViewProps(overrides: Partial<CommandPaletteViewProps> = {}): CommandPaletteViewProps {
  return {
    activeFilters: [],
    commandInputValue: '',
    isProcessing: false,
    hasMatchingCommands: true,
    allCommands: [],
    searchQuery: '',
    recentSearches: [],
    quickSearchResults: [],
    userLabels: [],
    selectedDateFilter: null,
    selectedDate: undefined,
    dateRangeStart: undefined,
    dateRangeEnd: undefined,
    emailSuggestions: [],
    setCommandInputValue: vi.fn(),
    setCurrentView: vi.fn(),
    setSearchQuery: vi.fn(),
    setSelectedDateFilter: vi.fn(),
    setSelectedDate: vi.fn(),
    setDateRangeStart: vi.fn(),
    setDateRangeEnd: vi.fn(),
    clearAllFilters: vi.fn(),
    removeFilter: vi.fn(),
    addFilter: vi.fn(),
    executeSearch: vi.fn(),
    handleSearch: vi.fn(),
    runCommand: vi.fn(),
    navigate: vi.fn() as unknown as NavigateFunction,
    ...overrides,
  };
}

function renderSearchView(overrides: Partial<CommandPaletteViewProps>) {
  act(() => {
    root.render(<SearchView {...makeViewProps(overrides)} />);
  });
}

function findCommand(text: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-command-item]'),
  ).find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`Command not found: ${text}`);
  return button;
}

function LexicalSearchSurface() {
  const [open] = useQueryState('isCommandPaletteOpen');
  const [lexicalRequest, setLexicalRequest] = useQueryState('isLexicalSearchOpen');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowSearch(false);
      return;
    }
    if (lexicalRequest) {
      setShowSearch(true);
      setLexicalRequest(null);
    }
  }, [lexicalRequest, open, setLexicalRequest]);

  return open && showSearch ? <SearchView {...makeViewProps()} /> : null;
}

function FilterResetSurface() {
  const { labels, setLabels } = useSearchLabels();
  const [category, setCategory] = useQueryState('category');

  return (
    <button
      type="button"
      data-filter-reset
      onClick={() => clearMailQueryFilters({ setLabels, setCategory })}
    >
      {labels.join(',')}|{category}
    </button>
  );
}

beforeEach(() => {
  queryStore.values.clear();
  queryStore.listeners.clear();
  queryStore.writes = [];
  testSpies.toastError.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SearchView lexical entry', () => {
  it('clears real label/category query states and treats label-only results as filtered', () => {
    queryStore.values.set('labels', 'IMPORTANT,STARRED');
    queryStore.values.set('category', 'Promotions');

    act(() => root.render(<FilterResetSurface />));
    expect(container.textContent).toBe('IMPORTANT,STARRED|Promotions');
    expect(
      hasActiveMailFilters({
        searchText: '',
        labels: ['IMPORTANT'],
        category: null,
        activeFilterCount: 0,
      }),
    ).toBe(true);
    expect(
      hasActiveMailFilters({
        searchText: '',
        labels: [],
        category: null,
        activeFilterCount: 0,
      }),
    ).toBe(false);

    act(() => container.querySelector<HTMLButtonElement>('[data-filter-reset]')?.click());

    expect(queryStore.values.get('labels')).toBeNull();
    expect(queryStore.values.get('category')).toBeNull();
    expect(queryStore.writes).toEqual(
      expect.arrayContaining([
        { key: 'labels', value: null },
        { key: 'category', value: null },
      ]),
    );
  });

  it('keeps Enter lexical and requires selection of the explicit AI command', () => {
    const handleSearch = vi.fn<(query: string, useAI?: boolean) => void>();
    renderSearchView({ searchQuery: 'invoice', handleSearch });

    act(() => {
      container
        .querySelector('input')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(handleSearch).toHaveBeenLastCalledWith('invoice', false);

    act(() => findCommand('Smart Search').click());
    expect(handleSearch).toHaveBeenLastCalledWith('invoice', true);
  });

  it.each(Array.from({ length: 20 }, (_, index) => index))(
    'renders sender and opens the exact inbox thread for deterministic case %i',
    (index) => {
      const navigate = vi.fn() as unknown as NavigateFunction;
      const sender = `Sender ${index}`;
      const threadId = `thread-${String(index).padStart(2, '0')}`;

      renderSearchView({
        searchQuery: sender,
        quickSearchResults: [
          {
            id: threadId,
            subject: `Subject ${index}`,
            sender: { name: sender, email: `sender-${index}@example.com` },
            snippet: `Snippet ${index}`,
          },
        ],
        navigate,
        runCommand: (command) => command(),
      });

      expect(container.textContent).toContain(sender);
      act(() => findCommand(sender).click());
      expect(navigate).toHaveBeenCalledWith(`/mail/inbox?threadId=${threadId}`);
    },
  );

  it('routes 20 warm slash events through GlobalHotkeys and focuses lexical search in p75 <100ms', async () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/mail/inbox']}>
          <HotkeysProvider initiallyActiveScopes={['global']}>
            <GlobalHotkeys />
            <LexicalSearchSurface />
          </HotkeysProvider>
        </MemoryRouter>,
      );
    });

    // Warm the lazy dialog once; the measured openings below exercise the warm-cache contract.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          code: 'Slash',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await act(async () => Promise.resolve());
    expect(
      document.activeElement?.getAttribute('aria-label'),
      `${container.innerHTML}\n${JSON.stringify(queryStore.writes)}`,
    ).toBe('Search your emails...');
    act(() => publishQueryValue('isCommandPaletteOpen', null));
    await act(async () => Promise.resolve());

    const durations: number[] = [];
    for (let opening = 0; opening < 20; opening++) {
      queryStore.writes = [];
      const startedAt = performance.now();
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: '/',
            code: 'Slash',
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await act(async () => Promise.resolve());
      durations.push(performance.now() - startedAt);

      expect(document.activeElement?.getAttribute('aria-label')).toBe('Search your emails...');
      expect(
        queryStore.writes.filter(
          ({ key, value }) => key === 'isLexicalSearchOpen' && value === 'true',
        ),
      ).toHaveLength(1);
      expect(
        queryStore.writes.filter(
          ({ key, value }) => key === 'isCommandPaletteOpen' && value === 'true',
        ),
      ).toHaveLength(1);

      act(() => publishQueryValue('isCommandPaletteOpen', null));
      await act(async () => Promise.resolve());
    }

    const sorted = [...durations].sort((left, right) => left - right);
    const p75 = sorted[Math.ceil(sorted.length * 0.75) - 1];
    expect(p75).toBeDefined();
    expect(p75).toBeLessThan(100);
  });
});
