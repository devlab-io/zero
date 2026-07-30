import {
  PALETTE_COMMANDS,
  type ActiveFilter,
  type CommandGroupData,
  type CommandItem,
  type CommandView,
  type PaletteCommandTarget,
} from './command-registry';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { getRecentSearches, saveRecentSearch } from './command-palette-storage';
import { getMainSearchTerm, parseNaturalLanguageSearch } from '@/lib/utils';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type CommandPaletteViewProps } from './command-palette-views';
import { Clock, Loader2, Mail, Paperclip, Star } from 'lucide-react';
import { isSimpleLiteralSearch } from '@/lib/search-intent';
import { useSearchValue } from '@/hooks/use-search-value';
import { CommandDialog } from '@/components/ui/command';
import { useLocation, useNavigate } from 'react-router';
import { navigationConfig } from '@/config/navigation';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useThreads } from '@/hooks/use-threads';
import { useLabels } from '@/hooks/use-labels';
import { format, subDays } from 'date-fns';
import { VisuallyHidden } from 'radix-ui';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
import { log } from '@/lib/log';
import { toast } from 'sonner';

// #44 (gate A8): the heavy command-palette body — its state, command/search logic, cmdk
// CommandDialog and views (with the react-day-picker calendar) — lives here and is dynamic-imported
// only when the palette is open (see CommandPaletteProvider). The lightweight provider keeps the
// eager surface (activeFilters, clearAllFilters, the ⌘/Ctrl+K toggle, filter storage restore) and
// passes the shared filter state in as props.
const MainView = lazy(() =>
  import('./command-palette-views').then((mod) => ({ default: mod.MainView })),
);
const SearchView = lazy(() =>
  import('./command-palette-views').then((mod) => ({ default: mod.SearchView })),
);
const LabelsView = lazy(() =>
  import('./command-palette-views').then((mod) => ({ default: mod.LabelsView })),
);
const HelpView = lazy(() =>
  import('./command-palette-views').then((mod) => ({ default: mod.HelpView })),
);
const FilterView = lazy(() =>
  import('./command-palette-filter-view').then((mod) => ({ default: mod.FilterView })),
);

export type CommandPaletteDialogProps = {
  open: string | null;
  setOpen: (value: string | null) => void;
  activeFilters: ActiveFilter[];
  addFilter: (filter: ActiveFilter) => void;
  removeFilter: (filterId: string) => void;
  clearAllFilters: () => void;
};

export function CommandPaletteDialog({
  open,
  setOpen,
  activeFilters,
  addFilter,
  removeFilter,
  clearAllFilters,
}: CommandPaletteDialogProps) {
  const [, setIsComposeOpen] = useQueryState('isComposeOpen');
  const [currentView, setCurrentView] = useState<CommandView>('main');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateRangeStart, setDateRangeStart] = useState<Date | undefined>(undefined);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchValue, setSearchValue] = useSearchValue();
  const [, threads] = useThreads();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [commandInputValue, setCommandInputValue] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { userLabels = [] } = useLabels();
  const trpc = useTRPC();
  const { mutateAsync: generateSearchQuery } = useMutation(
    trpc.ai.generateSearchQuery.mutationOptions(),
  );

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    if (threads && Array.isArray(threads)) {
      const emails = new Set<string>();
      // NOTE: useThreads yields a minimal thread shape ({ id, historyId }); the
      // `from`/`to` reads below resolve to undefined at runtime (pre-existing —
      // see job report "bugs réels"). Kept `any` to preserve that behaviour.
      threads.forEach((thread: any) => {
        if (thread?.from?.email) emails.add(thread.from.email);
        if (thread?.to && Array.isArray(thread.to)) {
          thread.to.forEach((recipient: { email?: string } | null) => {
            if (recipient?.email) emails.add(recipient.email);
          });
        }
      });
      setEmailSuggestions(Array.from(emails).slice(0, 20));
    }
  }, [threads]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setCurrentView('filter');
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setCurrentView('search');
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setCurrentView('labels');
      }

      if (e.key === 'Escape' && currentView !== 'main') {
        e.preventDefault();
        setCurrentView('main');
      }
    };

    document.addEventListener('keydown', down, { capture: true });
    return () => document.removeEventListener('keydown', down, { capture: true });
  }, [currentView]);

  const runCommand = useCallback(
    (command: () => unknown) => {
      setOpen(null);
      command();
    },
    [setOpen],
  );

  const executeSearch = useCallback(
    (query: string, isNaturalLanguage = false) => {
      setOpen(null);

      if (query && query.trim()) {
        saveRecentSearch(query);
        setRecentSearches(getRecentSearches());
      }

      let finalQuery = query;

      if (isNaturalLanguage) {
        const semanticQuery = parseNaturalLanguageSearch(query);
        finalQuery = semanticQuery || query;
      }

      const isFilterSyntax = /^(from:|to:|subject:|has:|is:|after:|before:|label:)/.test(
        query.trim(),
      );
      if (query.trim() && !isFilterSyntax) {
        const searchFilter: ActiveFilter = {
          id: `search-${Date.now()}`,
          type: 'search',
          value: query,
          display: `Search: "${query}"`,
        };
        addFilter(searchFilter);
      }

      const filterQuery = activeFilters.map((f) => f.value).join(' ');
      if (filterQuery) {
        finalQuery = `${finalQuery} ${filterQuery}`.trim();
      }

      setSearchValue({
        value: finalQuery,
        highlight: getMainSearchTerm(finalQuery),
        folder: searchValue.folder,
        isAISearching: isNaturalLanguage,
      });

      log.warn('Search applied', {
        description: finalQuery,
      });
    },
    [activeFilters, searchValue.folder, setSearchValue, addFilter, setOpen],
  );

  const quickFilterOptions = useMemo(
    () => [
      {
        title: 'Unread Emails',
        icon: Mail,
        onClick: () => {
          const filter: ActiveFilter = {
            id: 'quick-unread',
            type: 'status',
            value: 'is:unread',
            display: 'Unread',
          };
          addFilter(filter);
          executeSearch('is:unread');
        },
      },
      {
        title: 'Starred Emails',
        icon: Star,
        onClick: () => {
          const filter: ActiveFilter = {
            id: 'quick-starred',
            type: 'status',
            value: 'is:starred',
            display: 'Starred',
          };
          addFilter(filter);
          executeSearch('is:starred');
        },
      },
      {
        title: 'With Attachments',
        icon: Paperclip,
        onClick: () => {
          const filter: ActiveFilter = {
            id: 'quick-attachment',
            type: 'attachment',
            value: 'has:attachment',
            display: 'Has Attachment',
          };
          addFilter(filter);
          executeSearch('has:attachment');
        },
      },
      {
        title: 'Last 7 Days',
        icon: Clock,
        onClick: () => {
          const date = format(subDays(new Date(), 7), 'yyyy/MM/dd');
          const filter: ActiveFilter = {
            id: 'quick-recent',
            type: 'date',
            value: `after:${date}`,
            display: 'Last 7 days',
          };
          addFilter(filter);
          executeSearch(`after:${date}`);
        },
      },
    ],
    [addFilter, executeSearch],
  );

  const handleSearch = useCallback(
    async (query: string, useNaturalLanguage = true) => {
      if (isProcessing) return;

      // CUA 2026-07-30 : coût amont mesuré — ce chemin appelait TOUJOURS
      // ai.generateSearchQuery (aller-retour OpenAI) avant setSearchValue, même
      // pour une phrase littérale comme « Banque de Tahiti ». Bypass
      // déterministe : une requête littérale simple part immédiatement en
      // recherche exacte (préview projection + Gmail authoritatif) ; l'IA reste
      // en place pour la vraie intention naturelle, les dates et les opérateurs.
      const effectiveNaturalLanguage = useNaturalLanguage && !isSimpleLiteralSearch(query);
      setIsProcessing(true);

      try {
        let finalQuery = query;

        if (effectiveNaturalLanguage) {
          const result = await generateSearchQuery({ query });
          finalQuery = result.query;

          const searchFilter: ActiveFilter = {
            id: `ai-search-${Date.now()}`,
            type: 'search',
            value: finalQuery,
            display: `AI Search: "${query}"`,
          };
          addFilter(searchFilter);

          setOpen(null);

          return setSearchValue({
            value: finalQuery,
            highlight: getMainSearchTerm(query),
            folder: searchValue.folder,
            isAISearching: useNaturalLanguage,
            isLoading: true,
          });
        }

        const isFilterSyntax = /^(from:|to:|subject:|has:|is:|after:|before:|label:)/.test(
          query.trim(),
        );
        if (query.trim() && !isFilterSyntax) {
          const searchFilter: ActiveFilter = {
            id: `search-${Date.now()}`,
            type: 'search',
            value: query,
            display: `Search: "${query}"`,
          };
          addFilter(searchFilter);
        }

        const filterQuery = activeFilters.map((f) => f.value).join(' ');
        if (filterQuery) {
          finalQuery = `${finalQuery} ${filterQuery}`.trim();
        }

        if (query && query.trim()) {
          saveRecentSearch(query);
          setRecentSearches(getRecentSearches());
        }

        setSearchValue({
          value: finalQuery,
          highlight: getMainSearchTerm(query),
          folder: searchValue.folder,
          isAISearching: effectiveNaturalLanguage,
          isLoading: true,
        });

        log.warn('Search applied', {
          description: finalQuery,
        });

        setOpen(null);
      } catch (error) {
        log.error('Search error:', error);
        toast.error('Failed to process search');
      } finally {
        setIsProcessing(false);
      }
    },
    [
      activeFilters,
      searchValue.folder,
      isProcessing,
      addFilter,
      generateSearchQuery,
      setOpen,
      setSearchValue,
    ],
  );

  const quickSearchResults = useMemo(() => {
    try {
      if (!searchQuery || searchQuery.length < 2 || !threads) return [];

      const validThreads = Array.isArray(threads) ? threads.filter(Boolean) : [];
      if (validThreads.length === 0) return [];

      return validThreads
        .filter((thread: any) => {
          try {
            if (!thread || typeof thread !== 'object') return false;

            const query = searchQuery.toLowerCase();

            const snippet = thread.snippet?.toString() || '';
            const subject = thread.subject?.toString() || '';
            const fromName = thread.from?.name?.toString() || '';
            const fromEmail = thread.from?.email?.toString() || '';

            return (
              snippet.toLowerCase().includes(query) ||
              subject.toLowerCase().includes(query) ||
              fromName.toLowerCase().includes(query) ||
              fromEmail.toLowerCase().includes(query)
            );
          } catch (err) {
            log.error('Error filtering thread:', err);
            return false;
          }
        })
        .slice(0, 5);
    } catch (error) {
      log.error('Error processing search results:', error);
      return [];
    }
  }, [searchQuery, threads]);

  const allCommands = useMemo<CommandGroupData[]>(() => {
    const searchCommands: CommandItem[] = [];
    const mailCommands: CommandItem[] = [];
    const settingsCommands: CommandItem[] = [];
    const otherCommands: Record<string, CommandItem[]> = {};

    const makeOnClick = (target: PaletteCommandTarget): (() => unknown) => {
      if (target.kind === 'compose') return () => setIsComposeOpen('true');
      return () => setCurrentView(target.view);
    };

    for (const cmd of PALETTE_COMMANDS) {
      if (cmd.group === 'mail') {
        mailCommands.push({
          title: cmd.title,
          icon: cmd.icon,
          shortcut: cmd.shortcut,
          onClick: makeOnClick(cmd.target),
        });
      } else if (cmd.group === 'search') {
        searchCommands.push({
          title: cmd.title,
          icon: cmd.icon,
          shortcut: cmd.shortcut,
          onClick: makeOnClick(cmd.target),
        });
      }
      // 'help' group commands are rendered separately in the main view.
    }

    quickFilterOptions.forEach((option) => {
      searchCommands.push({
        title: option.title,
        icon: option.icon,
        onClick: option.onClick,
      });
    });

    for (const sectionKey in navigationConfig) {
      const section = navigationConfig[sectionKey];

      section?.sections.forEach((group) => {
        group.items.forEach((navItem) => {
          if (navItem.disabled) return;
          const item: CommandItem = {
            title: navItem.title,
            icon: navItem.icon,
            url: navItem.url,
            shortcut: navItem.shortcut,
            isBackButton: navItem.isBackButton,
            disabled: navItem.disabled,
          };

          if (sectionKey === 'mail') {
            mailCommands.push(item);
          } else if (sectionKey === 'settings') {
            if (!item.isBackButton || pathname.startsWith('/settings')) {
              settingsCommands.push(item);
            }
          } else {
            if (!otherCommands[sectionKey]) {
              otherCommands[sectionKey] = [];
            }
            otherCommands[sectionKey].push(item);
          }
        });
      });
    }

    const result: CommandGroupData[] = [
      {
        group: 'Search',
        items: searchCommands,
      },
      {
        group: 'Mail',
        items: mailCommands,
      },
      {
        group: 'Settings',
        items: settingsCommands,
      },
    ];

    // Literal lookups keep the paraglide catalog tree-shakable (no dynamic `m[...]` access).
    const groupTitles: Record<string, () => string> = {
      mail: m['common.commandPalette.groups.mail'],
      settings: m['common.commandPalette.groups.settings'],
      actions: m['common.commandPalette.groups.actions'],
      help: m['common.commandPalette.groups.help'],
      navigation: m['common.commandPalette.groups.navigation'],
    };

    Object.entries(otherCommands).forEach(([groupKey, items]) => {
      if (items.length > 0) {
        let groupTitle = groupKey;
        try {
          groupTitle = groupTitles[groupKey]?.() || groupKey;
        } catch {}

        result.push({
          group: groupTitle,
          items,
        });
      }
    });

    return result;
  }, [pathname, setIsComposeOpen, quickFilterOptions]);

  const hasMatchingCommands = useMemo(() => {
    if (!commandInputValue.trim()) return true;

    const searchTerm = commandInputValue.toLowerCase();

    return allCommands.some((group) =>
      group.items.some(
        (item) =>
          item.title.toLowerCase().includes(searchTerm) ||
          (item.description && item.description.toLowerCase().includes(searchTerm)) ||
          (item.keywords &&
            item.keywords.some((keyword) => keyword.toLowerCase().includes(searchTerm))),
      ),
    );
  }, [commandInputValue, allCommands]);

  const viewProps: CommandPaletteViewProps = {
    activeFilters,
    commandInputValue,
    isProcessing,
    hasMatchingCommands,
    allCommands,
    searchQuery,
    recentSearches,
    quickSearchResults,
    userLabels,
    selectedDateFilter,
    selectedDate,
    dateRangeStart,
    dateRangeEnd,
    emailSuggestions,
    setCommandInputValue,
    setCurrentView,
    setSearchQuery,
    setSelectedDateFilter,
    setSelectedDate,
    setDateRangeStart,
    setDateRangeEnd,
    clearAllFilters,
    removeFilter,
    addFilter,
    executeSearch,
    handleSearch,
    runCommand,
    navigate,
  };

  const renderView = () => {
    switch (currentView) {
      case 'search':
        return <SearchView {...viewProps} />;
      case 'filter':
        return <FilterView {...viewProps} />;
      case 'dateRange':
        return <FilterView {...viewProps} />;
      case 'labels':
        return <LabelsView {...viewProps} />;
      case 'help':
        return <HelpView {...viewProps} />;
      default:
        return <MainView {...viewProps} />;
    }
  };

  return (
    <CommandDialog
      open={!!open}
      onOpenChange={(isOpen) => {
        if (!isOpen && currentView !== 'main') {
          setCurrentView('main');
          return;
        }
        setOpen(isOpen ? 'true' : null);
      }}
    >
      <VisuallyHidden.VisuallyHidden>
        <DialogTitle>{m['common.commandPalette.title']()}</DialogTitle>
        <DialogDescription>{m['common.commandPalette.description']()}</DialogDescription>
      </VisuallyHidden.VisuallyHidden>
      <Suspense
        fallback={
          <div role="status" aria-live="polite" className="flex items-center justify-center py-8">
            <Loader2 aria-hidden="true" className="text-muted-foreground h-5 w-5 animate-spin" />
            <span className="sr-only">Loading commands</span>
          </div>
        }
      >
        {renderView()}
      </Suspense>
    </CommandDialog>
  );
}
