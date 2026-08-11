import { MainView, type CommandPaletteViewProps } from './command-palette-views';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Command } from '@/components/ui/command';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const noop = vi.fn();

function props(overrides: Partial<CommandPaletteViewProps> = {}): CommandPaletteViewProps {
  return {
    activeFilters: [],
    commandInputValue: 'brapac',
    isProcessing: false,
    isEmailSearchLoading: false,
    hasMatchingCommands: false,
    allCommands: [],
    searchQuery: '',
    recentSearches: [],
    quickSearchResults: [],
    emailSearchQuery: 'brapac',
    userLabels: [],
    selectedDateFilter: null,
    selectedDate: undefined,
    dateRangeStart: undefined,
    dateRangeEnd: undefined,
    emailSuggestions: [],
    setCommandInputValue: noop,
    setCurrentView: noop,
    setSearchQuery: noop,
    setSelectedDateFilter: noop,
    setSelectedDate: noop,
    setDateRangeStart: noop,
    setDateRangeEnd: noop,
    clearAllFilters: noop,
    removeFilter: noop,
    addFilter: noop,
    executeSearch: noop,
    handleSearch: noop,
    runCommand: (command) => command(),
    navigate: noop,
    ...overrides,
  };
}

function render(viewProps: CommandPaletteViewProps) {
  act(() => {
    root.render(
      <Command>
        <MainView {...viewProps} />
      </Command>,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  noop.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MainView live email search', () => {
  it('shows matching emails while the user types, without asking for Enter', () => {
    render(
      props({
        quickSearchResults: [
          {
            id: 'thread-brapac',
            subject: 'BRAPAC — point d’avancement',
            sender: { name: 'Guillaume Pion', email: 'g.pion@brapac.pf' },
          },
        ],
      }),
    );

    expect(container.textContent).toContain('BRAPAC — point d’avancement');
    expect(container.textContent).toContain('Guillaume Pion');
    expect(container.textContent).not.toContain('press ENTER');
  });

  it('uses an honest empty state after the live search completes', () => {
    render(props());

    expect(container.textContent).toContain('No email found for “brapac”');
    expect(container.textContent).not.toContain('in this folder');
  });
});
