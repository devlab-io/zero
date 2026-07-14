import { useCommandPalette } from '@/components/context/command-palette-context';
import { useSidebar } from '@/components/context/sidebar-context';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { GLOBAL_HANDLED_ACTIONS } from './handler-manifest';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { useShortcuts } from './use-hotkey-utils';
import { ContextualShortcutSheet } from '@/app/(routes)/settings/shortcuts/contextual-shortcut-sheet';
import { useNavigate } from 'react-router';
import { useTheme } from 'next-themes';
import { useQueryState } from 'nuqs';
import { useState } from 'react';
import { useHotkeysContext } from 'react-hotkeys-hook';

export function GlobalHotkeys() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar } = useSidebar();
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const { clearAllFilters } = useCommandPalette();
  const [, setIsCommandPaletteOpen] = useQueryState('isCommandPaletteOpen');
  const { undoLastAction } = useOptimisticActions();
  const { activeScopes } = useHotkeysContext();
  const [isShortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const scope = 'global';

  const handlers: Record<(typeof GLOBAL_HANDLED_ACTIONS)[number], () => void> = {
    newEmail: () => setComposeOpen('true'),
    // `/` opens the command palette — Zero's fast lexical search surface (its dialog
    // auto-focuses the search input). There is no standalone /mail/search route.
    search: () => setIsCommandPaletteOpen('true'),
    commandPalette: () => setIsCommandPaletteOpen('true'),
    helpWithShortcuts: () => setShortcutHelpOpen(true),
    goToSettings: () => navigate('/settings'),
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    toggleSidebar: () => toggleSidebar(),
    clearAllFilters: () => clearAllFilters(),
    undoLastAction: () => {
      undoLastAction();
    },
  };

  const globalShortcuts = enhancedKeyboardShortcuts.filter((shortcut) => shortcut.scope === scope);

  useShortcuts(globalShortcuts, handlers, { scope });

  return <ContextualShortcutSheet open={isShortcutHelpOpen} onOpenChange={setShortcutHelpOpen} activeScopes={activeScopes} />;
}
