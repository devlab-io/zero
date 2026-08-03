import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { WorkspaceTab } from './global-workspace-model';

const OPEN_KEY = 'reta-global-workspace-open';
const TAB_KEY = 'reta-global-workspace-tab';

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

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === 'true');
      const stored = localStorage.getItem(TAB_KEY);
      if (stored === 'calendar' || stored === 'activity' || stored === 'contacts') setTab(stored);
    } catch {
      // Private mode/storage denial: the global panel still works in-memory.
    }
  }, []);

  const value = useMemo<GlobalWorkspaceContextValue>(
    () => ({
      open,
      tab,
      chooseWorkspaceTab: (next) => {
        setTab(next);
        setOpen(true);
        try {
          localStorage.setItem(TAB_KEY, next);
          localStorage.setItem(OPEN_KEY, 'true');
        } catch {
          // In-memory fallback.
        }
      },
      closeWorkspace: () => {
        setOpen(false);
        try {
          localStorage.setItem(OPEN_KEY, 'false');
        } catch {
          // In-memory fallback.
        }
      },
    }),
    [open, tab],
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
