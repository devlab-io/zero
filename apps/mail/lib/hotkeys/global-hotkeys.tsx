import {
  useCommandPalette,
  preloadCommandPalette,
} from '@/components/context/command-palette-context';
import { preloadAskRetaSurface } from '@/components/copilot/ask-reta-button';
import { preloadComposeSurface } from '@/components/create/compose-surface';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { shouldOpenAskRetaFromHotkey } from './ask-reta-hotkey-guard';
import { useSidebar } from '@/components/context/sidebar-context';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { GLOBAL_HANDLED_ACTIONS } from './handler-manifest';
import { useShortcuts } from './use-hotkey-utils';
import { useNavigate } from 'react-router';
import { useTheme } from 'next-themes';
import { useQueryState } from 'nuqs';

export function GlobalHotkeys() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar } = useSidebar();
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const [, setAskRetaOpen] = useQueryState('isAskRetaOpen');
  const { clearAllFilters } = useCommandPalette();
  const [, setIsCommandPaletteOpen] = useQueryState('isCommandPaletteOpen');
  const { undoLastAction } = useOptimisticActions();
  const scope = 'global';

  const handlers: Record<(typeof GLOBAL_HANDLED_ACTIONS)[number], () => void> = {
    // CUA 2026-07-30: fire the chunk warm at the very keydown — a no-op when the idle
    // warm already ran, the earliest possible fetch start when it has not.
    newEmail: () => {
      preloadComposeSurface();
      setComposeOpen('true');
    },
    // Shortwave parity: Y = ask about the current thread (the panel reads the
    // open-thread context from the URL), Mod+J = open Ask Reta. Same
    // warm-at-keydown pattern as compose. Y is guarded by the binder (single
    // key); Mod+J is a chord the binder keeps live in dialogs, so it applies
    // its own guard — never over an input, a dialog, or the open palette.
    askRetaThread: () => {
      preloadAskRetaSurface();
      setAskRetaOpen('true');
    },
    askRetaOpen: () => {
      if (!shouldOpenAskRetaFromHotkey(document.activeElement)) return;
      preloadAskRetaSurface();
      setAskRetaOpen('true');
    },
    // `/` opens the command palette — Zero's fast lexical search surface (its dialog
    // auto-focuses the search input). There is no standalone /mail/search route.
    // CUA 2026-07-30: both openers fire the chunk warm at the keystroke (no-op once warm).
    search: () => {
      preloadCommandPalette();
      setIsCommandPaletteOpen('true');
    },
    commandPalette: () => {
      preloadCommandPalette();
      setIsCommandPaletteOpen('true');
    },
    helpWithShortcuts: () => navigate('/settings/shortcuts'),
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

  return null;
}
