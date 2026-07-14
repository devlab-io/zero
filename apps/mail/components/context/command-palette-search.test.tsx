import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/ui/command', () => ({
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: any) => <button onClick={onSelect}>{children}</button>,
  CommandInput: ({ onKeyDown, value, placeholder }: any) => (
    <input aria-label={placeholder} value={value} onKeyDown={onKeyDown} readOnly />
  ),
  CommandList: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/ui/separator', () => ({ Separator: () => null }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock('../ui/button', () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { SearchView } from './command-palette-views';

describe('SearchView lexical entry', () => {
  it('uses direct lexical search when Enter is pressed', () => {
    const calls: boolean[] = [];
    const container = document.createElement('div');
    const root = createRoot(container);
    document.body.appendChild(container);
    act(() => {
      root.render(
        <SearchView
          activeFilters={[]}
          commandInputValue=""
          isProcessing={false}
          hasMatchingCommands
          allCommands={[]}
          searchQuery="invoice"
          recentSearches={[]}
          quickSearchResults={[]}
          userLabels={[]}
          selectedDateFilter={null}
          selectedDate={undefined}
          dateRangeStart={undefined}
          dateRangeEnd={undefined}
          emailSuggestions={[]}
          setCommandInputValue={vi.fn()}
          setCurrentView={vi.fn()}
          setSearchQuery={vi.fn()}
          setSelectedDateFilter={vi.fn()}
          setSelectedDate={vi.fn()}
          setDateRangeStart={vi.fn()}
          setDateRangeEnd={vi.fn()}
          clearAllFilters={vi.fn()}
          removeFilter={vi.fn()}
          addFilter={vi.fn()}
          executeSearch={vi.fn()}
          handleSearch={(_query, useAI) => {
            calls.push(Boolean(useAI));
          }}
          runCommand={vi.fn()}
          navigate={vi.fn() as any}
        />,
      );
    });
    act(() => {
      container.querySelector('input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(calls).toEqual([false]);
    act(() => root.unmount());
    container.remove();
  });
});
