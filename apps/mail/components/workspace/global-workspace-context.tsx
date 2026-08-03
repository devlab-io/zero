import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { WorkspaceTab } from './global-workspace-model';
import { useQueryState } from 'nuqs';

const TAB_KEY = 'reta-global-workspace-tab';
const LEGACY_OPEN_KEY = 'reta-global-workspace-open';

type GlobalWorkspaceContextValue = {
  open: boolean;
  tab: WorkspaceTab;
  chooseWorkspaceTab: (tab: WorkspaceTab) => void;
  closeWorkspace: () => void;
};

const GlobalWorkspaceContext = createContext<GlobalWorkspaceContextValue | null>(null);

export function GlobalWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>('calendar');
  const [askRetaOpen, setAskRetaOpen] = useQueryState('isAskRetaOpen');
  const previousAskRetaOpen = useRef(Boolean(askRetaOpen));

  useEffect(() => {
    try {
      // The last tool is useful context. Reopening a large workspace on every
      // reload is not: it obscures the primary email task without fresh intent.
      localStorage.removeItem(LEGACY_OPEN_KEY);
      const stored = localStorage.getItem(TAB_KEY);
      if (
        stored === 'calendar' ||
        stored === 'activity' ||
        stored === 'contacts' ||
        stored === 'assistant'
      ) {
        setTab(stored);
      }
    } catch {
      // Private mode/storage denial: the global panel still works in-memory.
    }
  }, []);

  useEffect(() => {
    const wasAskRetaOpen = previousAskRetaOpen.current;
    if (askRetaOpen && (!open || tab !== 'assistant')) {
      setTab('assistant');
      setOpen(true);
      try {
        localStorage.setItem(TAB_KEY, 'assistant');
      } catch {
        // In-memory fallback.
      }
    } else if (!askRetaOpen && wasAskRetaOpen && open && tab === 'assistant') {
      setOpen(false);
    }
    previousAskRetaOpen.current = Boolean(askRetaOpen);
  }, [askRetaOpen, open, tab]);

  const chooseWorkspaceTab = useCallback(
    (next: WorkspaceTab) => {
      setTab(next);
      setOpen(true);
      void setAskRetaOpen(next === 'assistant' ? 'true' : null);
      try {
        localStorage.setItem(TAB_KEY, next);
      } catch {
        // In-memory fallback.
      }
    },
    [setAskRetaOpen],
  );

  const closeWorkspace = useCallback(() => {
    setOpen(false);
    void setAskRetaOpen(null);
  }, [setAskRetaOpen]);

  const value = useMemo<GlobalWorkspaceContextValue>(
    () => ({
      open,
      tab,
      chooseWorkspaceTab,
      closeWorkspace,
    }),
    [chooseWorkspaceTab, closeWorkspace, open, tab],
  );

  return (
    <GlobalWorkspaceContext.Provider value={value}>{children}</GlobalWorkspaceContext.Provider>
  );
}

export function useGlobalWorkspace() {
  const context = useContext(GlobalWorkspaceContext);
  if (!context) throw new Error('useGlobalWorkspace must be used within GlobalWorkspaceProvider');
  return context;
}
