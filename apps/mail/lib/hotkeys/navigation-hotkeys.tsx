import { NAV_SEQUENCE_ACTIONS } from './handler-manifest';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { useShortcutSequences } from './use-hotkey-utils';
import { useSearchValue } from '@/hooks/use-search-value';
import { useNavigate } from 'react-router';

// `g …` navigation is TIMED two-key sequences, not chords, so it is driven by
// `useShortcutSequences` (not `useShortcuts`, which skips `type: 'sequence'`).
export function NavigationHotkeys() {
  const navigate = useNavigate();
  const [, setSearchValue] = useSearchValue();
  const scope = 'navigation';

  const handlers: Record<(typeof NAV_SEQUENCE_ACTIONS)[number], () => void> = {
    inbox: () => navigate('/mail/inbox'),
    // Zero has no starred FOLDER route; `g s` lands on inbox and applies the existing
    // `is:starred` search filter (the same query the palette's "Is Starred" runs), which
    // the thread list (use-threads) consumes via its query key — a live starred view.
    goToStarred: () => {
      navigate('/mail/inbox');
      setSearchValue({ value: 'is:starred', highlight: '', folder: '' });
    },
    goToSnoozed: () => navigate('/mail/snoozed'),
    goToArchive: () => navigate('/mail/archive'),
    sentMail: () => navigate('/mail/sent'),
    goToDrafts: () => navigate('/mail/draft'),
    goToSpam: () => navigate('/mail/spam'),
    goToBin: () => navigate('/mail/bin'),
  };

  const navigationShortcuts = enhancedKeyboardShortcuts.filter(
    (shortcut) => shortcut.scope === scope,
  );

  useShortcutSequences(navigationShortcuts, handlers);

  return null;
}
