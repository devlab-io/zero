import { COMPOSE_HANDLED_ACTIONS } from './handler-manifest';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { useShortcuts } from './use-hotkey-utils';
import { useQueryState } from 'nuqs';

// `sendEmail` (mod+Enter) is an `ignore` registry row — bound inside the composer editor
// (email-composer.tsx `onModEnter`), not here — so only `closeCompose` needs a handler.
export function ComposeHotkeys() {
  const scope = 'compose';
  const [isComposeOpen, setIsComposeOpen] = useQueryState('isComposeOpen');

  const handlers: Record<(typeof COMPOSE_HANDLED_ACTIONS)[number], () => void> = {
    closeCompose: () => {
      if (isComposeOpen === 'true') {
        setIsComposeOpen('false');
      }
    },
  };

  const composeShortcuts = enhancedKeyboardShortcuts.filter((shortcut) => shortcut.scope === scope);

  useShortcuts(composeShortcuts, handlers, { scope });

  return null;
}
