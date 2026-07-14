import { log } from '@/lib/log';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  FileText,
  Hash,
  Info,
  Loader2,
  Mail,
  Search,
  X as XIcon,
} from 'lucide-react';
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { Dispatch, SetStateAction } from 'react';
import { Fragment } from 'react';
import type { NavigateFunction } from 'react-router';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
  IN_PALETTE_VIEW_COMMAND_TITLES,
  PALETTE_TRIGGER_KEYS,
  type ActiveFilter,
  type CommandGroupData,
  type CommandView,
  type PaletteLabel,
  type QuickSearchThread,
} from './command-registry';

/**
 * Presentational views for the command palette. State and behaviour are owned by
 * the palette component and passed in through {@link CommandPaletteViewProps};
 * these components render only. The filter view lives in its own module
 * (`command-palette-filter-view`) because of its size.
 */
export interface CommandPaletteViewProps {
  // state
  activeFilters: ActiveFilter[];
  commandInputValue: string;
  isProcessing: boolean;
  hasMatchingCommands: boolean;
  allCommands: CommandGroupData[];
  searchQuery: string;
  recentSearches: string[];
  quickSearchResults: QuickSearchThread[];
  userLabels: PaletteLabel[];
  selectedDateFilter: string | null;
  selectedDate: Date | undefined;
  dateRangeStart: Date | undefined;
  dateRangeEnd: Date | undefined;
  emailSuggestions: string[];
  // setters
  setCommandInputValue: Dispatch<SetStateAction<string>>;
  setCurrentView: Dispatch<SetStateAction<CommandView>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSelectedDateFilter: Dispatch<SetStateAction<string | null>>;
  setSelectedDate: Dispatch<SetStateAction<Date | undefined>>;
  setDateRangeStart: Dispatch<SetStateAction<Date | undefined>>;
  setDateRangeEnd: Dispatch<SetStateAction<Date | undefined>>;
  // callbacks
  clearAllFilters: () => void;
  removeFilter: (filterId: string) => void;
  addFilter: (filter: ActiveFilter) => void;
  executeSearch: (query: string, isNaturalLanguage?: boolean) => void;
  handleSearch: (query: string, useNaturalLanguage?: boolean) => Promise<void> | void;
  runCommand: (command: () => unknown) => void;
  navigate: NavigateFunction;
}

export function MainView({
  activeFilters,
  clearAllFilters,
  removeFilter,
  commandInputValue,
  setCommandInputValue,
  hasMatchingCommands,
  handleSearch,
  isProcessing,
  allCommands,
  runCommand,
  navigate,
  setCurrentView,
}: CommandPaletteViewProps) {
  return (
    <>
      {activeFilters.length > 0 && (
        <div className="border-b px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Active Filters</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-6 px-2 text-xs"
              onClick={clearAllFilters}
            >
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {activeFilters.map((filter) => (
              <Badge key={filter.id} variant="secondary" className="pr-1 text-xs">
                {filter.display}
                <button
                  onClick={() => removeFilter(filter.id)}
                  className="hover:text-destructive ml-1"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      <CommandInput
        autoFocus
        placeholder="Type a command or search..."
        value={commandInputValue}
        onValueChange={setCommandInputValue}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && commandInputValue.trim() && !hasMatchingCommands) {
            e.preventDefault();
            handleSearch(commandInputValue, true);
          }
        }}
      />
      <Separator />
      <CommandList>
        <CommandEmpty>
          {isProcessing ? (
            <Loader2 className="m-auto h-4 w-4 animate-spin" />
          ) : (
            <>
              No results found, press <span className="font-bold">ENTER</span> to search for emails
              in this folder
            </>
          )}
        </CommandEmpty>
        {allCommands.map((group, groupIndex) => (
          <Fragment key={group.group}>
            {group.items.length > 0 && (
              <CommandGroup heading={group.group}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.url || item.title}
                    onSelect={() => {
                      if (IN_PALETTE_VIEW_COMMAND_TITLES.includes(item.title)) {
                        if (item.onClick) {
                          item.onClick();
                          return false;
                        }
                      } else {
                        runCommand(() => {
                          if (item.onClick) {
                            item.onClick();
                          } else if (item.url) {
                            navigate(item.url);
                          }
                        });
                      }
                    }}
                  >
                    {item.icon && (
                      <item.icon
                        size={16}
                        strokeWidth={2}
                        className="h-4 w-4 opacity-60"
                        aria-hidden="true"
                      />
                    )}
                    <div className="ml-2 flex flex-1 flex-col">
                      <span>{item.title}</span>
                      {item.description && (
                        <span className="text-muted-foreground text-xs">{item.description}</span>
                      )}
                    </div>
                    {/* {item.shortcut && (
                      <CommandShortcut>
                        {item.shortcut === 'arrowUp'
                          ? '↑'
                          : item.shortcut === 'arrowDown'
                            ? '↓'
                            : item.shortcut}
                      </CommandShortcut>
                    )} */}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {groupIndex < allCommands.length - 1 && group.items.length > 0 && <Separator />}
          </Fragment>
        ))}

        <CommandGroup heading="Help">
          <CommandItem onSelect={() => setCurrentView('help')}>
            <Info className="h-4 w-4 opacity-60" />
            <span className="ml-2">Filter Syntax Help</span>
            {/* <CommandShortcut>?</CommandShortcut> */}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  );
}

export function SearchView({
  searchQuery,
  setSearchQuery,
  setCurrentView,
  isProcessing,
  handleSearch,
  recentSearches,
  quickSearchResults,
  runCommand,
  navigate,
}: CommandPaletteViewProps) {
  return (
    <>
      <div className="flex items-center border-b px-3">
        <button
          className="text-muted-foreground hover:text-foreground relative top-0.5 mr-2"
          onClick={() => setCurrentView('main')}
          disabled={isProcessing}
        >
          ←
        </button>
        <CommandInput
          autoFocus
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search your emails..."
          className="w-full border-none"
          disabled={isProcessing}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery.trim()) {
              e.preventDefault();
              handleSearch(searchQuery, true);
            }
          }}
        />
        {isProcessing && (
          <div className="ml-2">
            <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        )}
      </div>
      <CommandList>
        <CommandEmpty>Type to search your emails...</CommandEmpty>

        {recentSearches.length > 0 && !searchQuery && (
          <CommandGroup heading="Recent Searches">
            {recentSearches.map((search, index) => (
              <CommandItem
                key={`recent-${index}`}
                onSelect={() => handleSearch(search, true)}
                disabled={isProcessing}
              >
                <Clock className="h-4 w-4 opacity-60" />
                <span className="ml-2">{search}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {quickSearchResults.length > 0 && (
          <CommandGroup heading="Quick Results">
            {quickSearchResults.map((thread: QuickSearchThread) => (
              <CommandItem
                key={thread.id || `thread-${Math.random()}`}
                onSelect={() => {
                  runCommand(() => {
                    try {
                      if (thread && thread.id) {
                        navigate(`/inbox?threadId=${thread.id}`);
                      }
                    } catch (error) {
                      log.error('Error navigating to thread:', error);
                      toast.error('Failed to open email');
                    }
                  });
                }}
                disabled={isProcessing}
              >
                <Mail className="h-4 w-4 opacity-60" />
                <div className="ml-2 flex flex-1 flex-col overflow-hidden">
                  <span className="truncate font-medium">{thread.subject || 'No Subject'}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {thread.from?.name || thread.from?.email || 'Unknown sender'} -{' '}
                    {thread.snippet || ''}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searchQuery && (
          <CommandGroup heading="Search Suggestions">
            <CommandItem onSelect={() => handleSearch(searchQuery, true)} disabled={isProcessing}>
              <Search className="h-4 w-4 opacity-60" />
              <span className="ml-2">Search for "{searchQuery}"</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                Smart Search
              </Badge>
            </CommandItem>

            <CommandItem onSelect={() => handleSearch(searchQuery, false)} disabled={isProcessing}>
              <Search className="relative top-2 h-4 w-4 opacity-60" />
              <span className="ml-2">Exact match: "{searchQuery}"</span>
            </CommandItem>

            {searchQuery.includes('@') && (
              <CommandItem
                onSelect={() => handleSearch(`from:${searchQuery}`, false)}
                disabled={isProcessing}
              >
                <Mail className="h-4 w-4 opacity-60" />
                <span className="ml-2">From: {searchQuery}</span>
              </CommandItem>
            )}

            <CommandItem
              onSelect={() => handleSearch(`subject:"${searchQuery}"`, false)}
              disabled={isProcessing}
            >
              <FileText className="h-4 w-4 opacity-60" />
              <span className="ml-2">Subject contains: "{searchQuery}"</span>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSearch(`"${searchQuery}"`, false)}
              disabled={isProcessing}
            >
              <Hash className="h-4 w-4 opacity-60" />
              <span className="ml-2">Body contains: "{searchQuery}"</span>
            </CommandItem>
          </CommandGroup>
        )}

        {!searchQuery && (
          <CommandGroup heading="Try Natural Language">
            {[
              'emails from john',
              'emails from last week',
              'unread emails with attachments',
              'emails about meeting',
              'emails from december 2023',
            ].map((example) => (
              <CommandItem
                key={example}
                onSelect={() => {
                  setSearchQuery(example);
                  handleSearch(example, true);
                }}
                disabled={isProcessing}
              >
                <ArrowRight className="h-4 w-4 opacity-60" />
                <span className="text-muted-foreground ml-2 italic">{example}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
}

export function LabelsView({
  setCurrentView,
  searchQuery,
  setSearchQuery,
  userLabels,
  addFilter,
  executeSearch,
}: CommandPaletteViewProps) {
  return (
    <>
      <div className="flex items-center border-b px-3">
        <button
          className="text-muted-foreground hover:text-foreground ml-2"
          onClick={() => setCurrentView('filter')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <CommandInput
          autoFocus
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search labels..."
          className="border-0"
        />
      </div>
      <ScrollArea className="h-[400px]">
        <div className="p-4">
          {userLabels.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">
              No labels found. Create labels in Gmail to use them here.
            </p>
          ) : (
            <div className="space-y-2">
              {userLabels
                .filter(
                  (label) =>
                    !searchQuery ||
                    (label.name && label.name.toLowerCase().includes(searchQuery.toLowerCase())),
                )
                .map((label) => (
                  <div
                    key={label.id}
                    className="hover:bg-accent flex cursor-pointer items-center space-x-2 rounded-md border p-2"
                    onClick={() => {
                      if (label.name) {
                        const filterValue = `label:${label.name}`;
                        const activeFilter: ActiveFilter = {
                          id: `filter-${Date.now()}`,
                          type: 'label',
                          value: filterValue,
                          display: `Label: ${label.name}`,
                        };
                        addFilter(activeFilter);
                        executeSearch(filterValue);
                      }
                    }}
                  >
                    {label.color?.backgroundColor && (
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: label.color.backgroundColor }}
                      />
                    )}
                    <span className="text-sm">{label.name || 'Unnamed Label'}</span>
                    {/* {selectedLabels.includes(label.id || '') && (
                      <Check className="ml-auto h-4 w-4" />
                    )} */}
                  </div>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

export function HelpView({ setCurrentView }: CommandPaletteViewProps) {
  return (
    <>
      <div className="flex items-center border-b px-3">
        <button
          className="text-muted-foreground hover:text-foreground mr-2"
          onClick={() => setCurrentView('main')}
        >
          ←
        </button>
        <h3 className="font-medium">Filter Syntax Help</h3>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-4 p-4">
          <div>
            <h4 className="mb-2 font-medium">Basic Filters</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">from:email@example.com</code>
                <span className="text-muted-foreground">Emails from specific sender</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">to:email@example.com</code>
                <span className="text-muted-foreground">Emails to specific recipient</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">subject:"meeting notes"</code>
                <span className="text-muted-foreground">Emails with specific subject</span>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 font-medium">Status Filters</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">is:unread</code>
                <span className="text-muted-foreground">Unread emails</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">is:starred</code>
                <span className="text-muted-foreground">Starred emails</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">has:attachment</code>
                <span className="text-muted-foreground">Emails with attachments</span>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 font-medium">Date Filters</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">after:2024/01/01</code>
                <span className="text-muted-foreground">Emails after date</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">before:2024/12/31</code>
                <span className="text-muted-foreground">Emails before date</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted rounded px-2 py-1">older_than:1d</code>
                <span className="text-muted-foreground">Emails older than 1 day</span>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 font-medium">Combining Filters</h4>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                You can combine multiple filters with spaces. All filters are applied with AND
                logic.
              </p>
              <code className="bg-muted block rounded px-2 py-1">
                from:boss@company.com is:unread has:attachment
              </code>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 font-medium">Natural Language</h4>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                You can also use natural language queries which will be converted to filters:
              </p>
              <div className="space-y-1">
                <p className="italic">"emails from john about the project"</p>
                <p className="italic">"unread messages with attachments from last week"</p>
                <p className="italic">"starred emails from my boss"</p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 font-medium">Keyboard Shortcuts</h4>
            <div className="space-y-2 text-sm">
              {PALETTE_TRIGGER_KEYS.map((key) => (
                <div key={key.display} className="flex justify-between">
                  <kbd className="bg-muted rounded px-2 py-1">{key.display}</kbd>
                  <span className="text-muted-foreground">{key.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
