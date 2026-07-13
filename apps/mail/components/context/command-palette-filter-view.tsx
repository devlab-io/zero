import { ArrowLeft, Calendar as CalendarIcon, Filter, Mail, X as XIcon } from 'lucide-react';
import { CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { FILTER_OPTIONS, type ActiveFilter } from './command-registry';
import type { CommandPaletteViewProps } from './command-palette-views';

/**
 * The filter view of the command palette — the largest view, split into its own
 * module. Presentational only; state and behaviour come from the palette component
 * via {@link CommandPaletteViewProps}.
 */
export function FilterView({
  selectedDateFilter,
  setSelectedDateFilter,
  setDateRangeStart,
  setDateRangeEnd,
  setCurrentView,
  searchQuery,
  setSearchQuery,
  addFilter,
  executeSearch,
  setSelectedDate,
  selectedDate,
  dateRangeStart,
  dateRangeEnd,
  emailSuggestions,
}: CommandPaletteViewProps) {
  return (
    <>
      <div className="flex items-center border-b px-3">
        <button
          className="text-muted-foreground hover:text-foreground ml-2"
          onClick={() => {
            if (selectedDateFilter) {
              setSelectedDateFilter(null);
              setDateRangeStart(undefined);
              setDateRangeEnd(undefined);
            } else {
              setCurrentView('main');
            }
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <CommandInput
          autoFocus
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Type to filter..."
          className="border-0"
        />
      </div>

      {!selectedDateFilter ? (
        <CommandList>
          {FILTER_OPTIONS.filter(
            (option) =>
              !searchQuery ||
              option.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              option.keywords.some((kw) => kw.toLowerCase().includes(searchQuery.toLowerCase())),
          ).length === 0 ? (
            <CommandEmpty>No filters found</CommandEmpty>
          ) : null}

          {!searchQuery ? (
            <CommandGroup heading="Available Filters">
              {FILTER_OPTIONS.map((filter) => (
                <CommandItem
                  key={filter.id}
                  onSelect={() => {
                    if (filter.id === 'after' || filter.id === 'before') {
                      setSelectedDateFilter(filter.id);
                      setSelectedDate(undefined);
                      return false;
                    }

                    if (filter.id === 'between') {
                      setSelectedDateFilter('between');
                      setDateRangeStart(undefined);
                      setDateRangeEnd(undefined);
                      return false;
                    }

                    if (filter.id === 'has:label') {
                      setCurrentView('labels');
                      return false;
                    }

                    if (!filter.requiresInput) {
                      const filterValue = filter.action();
                      const activeFilter: ActiveFilter = {
                        id: `filter-${Date.now()}`,
                        type: filter.id,
                        value: filterValue,
                        display: filter.name,
                      };
                      addFilter(activeFilter);
                      executeSearch(filterValue);
                    }
                  }}
                >
                  {filter.icon && <filter.icon className="h-4 w-4 opacity-60" />}
                  <span className="ml-2">{filter.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <>
              <CommandGroup heading="Matching Filters">
                {FILTER_OPTIONS.filter(
                  (option) =>
                    option.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    option.keywords.some((kw) =>
                      kw.toLowerCase().includes(searchQuery.toLowerCase()),
                    ),
                ).map((filter) => (
                  <CommandItem
                    key={filter.id}
                    onSelect={() => {
                      if (filter.id === 'after' || filter.id === 'before') {
                        setSelectedDateFilter(filter.id);
                        setSelectedDate(undefined);
                        return false;
                      }

                      if (filter.id === 'between') {
                        setSelectedDateFilter('between');
                        setDateRangeStart(undefined);
                        setDateRangeEnd(undefined);
                        return false;
                      }

                      if (filter.id === 'has:label') {
                        setCurrentView('labels');
                        return false;
                      }

                      const newQuery = filter.action(searchQuery);
                      const activeFilter: ActiveFilter = {
                        id: `filter-${Date.now()}`,
                        type: filter.id,
                        value: newQuery,
                        display: `${filter.name}: ${searchQuery}`,
                      };
                      addFilter(activeFilter);
                      executeSearch(newQuery);
                    }}
                  >
                    {filter.icon && <filter.icon className="h-4 w-4 opacity-60" />}
                    <span className="ml-2">{filter.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandGroup heading="Apply Search Term">
                {['from', 'to', 'subject'].map((filterId) => {
                  const filter = FILTER_OPTIONS.find((f) => f.id === filterId);
                  if (!filter) return null;
                  return (
                    <CommandItem
                      key={filter.id}
                      onSelect={() => {
                        const newQuery = filter.action(searchQuery);
                        const activeFilter: ActiveFilter = {
                          id: `filter-${Date.now()}`,
                          type: filter.id,
                          value: newQuery,
                          display: `${filter.name}: ${searchQuery}`,
                        };
                        addFilter(activeFilter);
                        executeSearch(newQuery);
                      }}
                    >
                      <Filter className="h-4 w-4 opacity-60" />
                      <span className="ml-2">
                        {filter.name}: <span className="font-medium">{searchQuery}</span>
                      </span>
                    </CommandItem>
                  );
                })}

                {['from', 'to'].includes(searchQuery) &&
                  emailSuggestions
                    .filter((email) => email.toLowerCase().includes(searchQuery.toLowerCase()))
                    .slice(0, 5)
                    .map((email) => (
                      <CommandItem
                        key={`suggestion-${email}`}
                        onSelect={() => {
                          const filter = FILTER_OPTIONS.find((f) => f.id === 'from');
                          if (filter) {
                            const newQuery = filter.action(email);
                            const activeFilter: ActiveFilter = {
                              id: `filter-${Date.now()}`,
                              type: 'from',
                              value: newQuery,
                              display: `From: ${email}`,
                            };
                            addFilter(activeFilter);
                            executeSearch(newQuery);
                          }
                        }}
                      >
                        <Mail className="h-4 w-4 opacity-60" />
                        <span className="ml-2 text-xs">{email}</span>
                      </CommandItem>
                    ))}
              </CommandGroup>
            </>
          )}

          <CommandGroup heading="Examples">
            <CommandItem disabled>
              <CalendarIcon className="h-4 w-4 opacity-60" />
              <span className="ml-2">after:2024/01/01</span>
            </CommandItem>
            <CommandItem disabled>
              <Mail className="h-4 w-4 opacity-60" />
              <span className="ml-2">from:john@example.com</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      ) : selectedDateFilter === 'between' ? (
        <div className="px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">Select date range</h3>
            <button
              onClick={() => {
                setSelectedDateFilter(null);
                setDateRangeStart(undefined);
                setDateRangeEnd(undefined);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Calendar
                mode="single"
                selected={dateRangeStart}
                onSelect={(date) => {
                  setDateRangeStart(date);
                  if (date && dateRangeEnd) {
                    const start = format(date, 'yyyy/MM/dd');
                    const end = format(dateRangeEnd, 'yyyy/MM/dd');
                    const filterValue = `after:${start} before:${end}`;
                    const activeFilter: ActiveFilter = {
                      id: `filter-${Date.now()}`,
                      type: 'dateRange',
                      value: filterValue,
                      display: `${format(date, 'MMM d')} - ${format(dateRangeEnd, 'MMM d, yyyy')}`,
                    };
                    addFilter(activeFilter);
                    executeSearch(filterValue);
                  }
                }}
                disabled={(date) => (dateRangeEnd ? date > dateRangeEnd : false)}
                className="rounded-md border"
              />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Calendar
                mode="single"
                selected={dateRangeEnd}
                onSelect={(date) => {
                  setDateRangeEnd(date);
                  if (dateRangeStart && date) {
                    const start = format(dateRangeStart, 'yyyy/MM/dd');
                    const end = format(date, 'yyyy/MM/dd');
                    const filterValue = `after:${start} before:${end}`;
                    const activeFilter: ActiveFilter = {
                      id: `filter-${Date.now()}`,
                      type: 'dateRange',
                      value: filterValue,
                      display: `${format(dateRangeStart, 'MMM d')} - ${format(date, 'MMM d, yyyy')}`,
                    };
                    addFilter(activeFilter);
                    executeSearch(filterValue);
                  }
                }}
                disabled={(date) => (dateRangeStart ? date < dateRangeStart : false)}
                className="rounded-md border"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {selectedDateFilter === 'after' ? 'Select date (after)' : 'Select date (before)'}
            </h3>
            <button
              onClick={() => setSelectedDateFilter(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col items-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                if (date) {
                  const formattedDate = format(date, 'yyyy/MM/dd');
                  const filterAction = selectedDateFilter === 'after' ? 'after:' : 'before:';
                  const filterValue = `${filterAction}${formattedDate}`;
                  const activeFilter: ActiveFilter = {
                    id: `filter-${Date.now()}`,
                    type: selectedDateFilter,
                    value: filterValue,
                    display: `${selectedDateFilter === 'after' ? 'After' : 'Before'} ${format(date, 'MMM d, yyyy')}`,
                  };
                  addFilter(activeFilter);
                  executeSearch(filterValue);
                }
              }}
              className="max-w-full rounded-md border"
            />
          </div>
        </div>
      )}
    </>
  );
}
