import {
  resolveThreadDisplayCaptureAction,
  selectAdjacentThreadTarget,
  shouldMarkAdjacentThreadRead,
} from '@/lib/thread-navigation';
import { focusedIndexAtom, mailNavigationCommandAtom } from '@/hooks/use-mail-navigation';
import { useSnoozePicker } from '@/components/context/snooze-picker-context';
import { buildThreadLink, shouldCopyThreadLink } from './copy-thread-link';
import { isTypingOrModalTarget, useShortcuts } from './use-hotkey-utils';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { THREAD_DISPLAY_HANDLED_ACTIONS } from './handler-manifest';
import { useReplyStatePurge } from '@/hooks/use-reply-state-purge';
import { optimisticActionsAtom } from '@/store/optimistic-updates';
import { selectArchiveAdvanceTarget } from '@/lib/archive-advance';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { markReplyOpened } from '@/lib/reply-search-params';
import { useThread, useThreads } from '@/hooks/use-threads';
import { armOpeningKeyGuard } from './opening-key-guard';
import { resolveStarredState } from '@/lib/star-toggle';
import useMoveTo from '@/hooks/driver/use-move-to';
import useDelete from '@/hooks/driver/use-delete';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router';
import { flushSync } from 'react-dom';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';

// `openLabels`/`openMove` open the label/move picker via the `picker` query-state
// (label-move-picker.tsx) — wired below since #32.
export function ThreadDisplayHotkeys() {
  const scope = 'thread-display';
  const [, setMode] = useQueryState('mode');
  const [, setActiveReplyId] = useQueryState('activeReplyId');
  const [, setPicker] = useQueryState('picker');
  const [openThreadId] = useQueryState('threadId');
  const { data: thread } = useThread(openThreadId);
  const [, items] = useThreads();
  const params = useParams<{
    folder: string;
  }>();
  const { mutate: deleteThread } = useDelete();
  const { mutate: moveTo } = useMoveTo();
  const setMailNavigationCommand = useSetAtom(mailNavigationCommandAtom);
  const setFocusedIndex = useSetAtom(focusedIndexAtom);
  const focusedIndex = useAtomValue(focusedIndexAtom);
  const optimisticActions = useAtomValue(optimisticActionsAtom);
  const purgeReplyState = useReplyStatePurge();
  const {
    optimisticMoveThreadsTo,
    optimisticMarkAsRead,
    optimisticMarkAsUnread,
    optimisticToggleImportant,
    optimisticToggleStar,
  } = useOptimisticActions();
  const { openSnoozePicker } = useSnoozePicker();

  const folder = params.folder ?? 'inbox';
  const tags = thread?.latest?.tags;
  const isStarred = resolveStarredState(
    openThreadId ?? '',
    tags?.some((tag) => tag.name === 'STARRED') ?? false,
    optimisticActions,
  );

  const openAdjacentThread = useCallback(
    (direction: 'next' | 'previous') => {
      if (!openThreadId) return;
      const target = selectAdjacentThreadTarget(items, openThreadId, direction, focusedIndex);
      if (!target) return;

      void purgeReplyState({ threadId: target.targetId });
      setFocusedIndex(target.index);
      if (shouldMarkAdjacentThreadRead(items[target.index])) {
        optimisticMarkAsRead([target.targetId], true);
      }
    },
    [focusedIndex, items, openThreadId, optimisticMarkAsRead, purgeReplyState, setFocusedIndex],
  );

  const closeOpenThread = useCallback(() => {
    // This capture handler runs outside React's synthetic event pipeline.
    // Flush the nuqs state write before returning so the reader disappears in
    // the same perceptual frame instead of one scheduler tick later.
    flushSync(() => {
      void purgeReplyState({ threadId: null });
    });
  }, [purgeReplyState]);

  // Reader navigation must work even when focus sits inside the isolated mail
  // content tree or the generic `thread-display` scope is inactive. Capture
  // before the scoped binder, then stop propagation so list handlers cannot
  // consume the same key. Composer/dialog focus keeps ownership of Escape.
  useEffect(() => {
    if (!openThreadId) return;

    const handleReaderNavigation = (event: KeyboardEvent) => {
      const action = resolveThreadDisplayCaptureAction({
        key: event.key,
        hasModifier: event.metaKey || event.ctrlKey || event.altKey || event.shiftKey,
        isTypingOrModal: isTypingOrModalTarget(event.target),
        isWorkspaceTarget:
          event.target instanceof Element && Boolean(event.target.closest('[data-reta-workspace]')),
      });
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      if (action === 'close') {
        closeOpenThread();
        return;
      }
      openAdjacentThread(action);
    };

    window.addEventListener('keydown', handleReaderNavigation, true);
    return () => window.removeEventListener('keydown', handleReaderNavigation, true);
  }, [closeOpenThread, openAdjacentThread, openThreadId]);

  // Devlab: d/e/[ = done — archive the open thread and move on; `]` archives and
  // opens the PREVIOUS item.
  // CUA round 3 (échec 4) : la cible est calculée SYNCHRONIQUEMENT avant la
  // suppression optimiste et le threadId est posé directement dans la MÊME
  // écriture d'URL que la purge reply — plus de détour par la commande de
  // navigation asynchrone (focusedIndex souvent null au clic, effet au render
  // suivant : l'avance arrivait à 1,3-1,5 s). Le shell optimiste peint la cible
  // immédiatement ; undo/retry inchangés (portés par optimisticMoveThreadsTo).
  const archiveAndMove = (direction: 'next' | 'previous') => {
    if (!openThreadId) return;
    const { targetId, focusedIndexAfter } = selectArchiveAdvanceTarget(
      items,
      openThreadId,
      direction,
    );
    optimisticMoveThreadsTo([openThreadId], folder, 'archive', { keepThreadOpen: true });
    void purgeReplyState({ threadId: targetId });
    setFocusedIndex(focusedIndexAfter);
  };

  const handlers: Record<(typeof THREAD_DISPLAY_HANDLED_ACTIONS)[number], () => void> = {
    openNext: () => openAdjacentThread('next'),
    openPrevious: () => openAdjacentThread('previous'),
    archive: () => archiveAndMove('next'),
    archiveNext: () => archiveAndMove('next'),
    archivePrevious: () => archiveAndMove('previous'),
    // `h` / `b` opens the shared picker. The next thread only opens after the
    // user confirms a time, so Escape is always a safe no-op.
    remind: () => {
      if (!openThreadId) return;
      openSnoozePicker({
        threadIds: [openThreadId],
        folder,
        afterConfirm: () => setMailNavigationCommand('next'),
      });
    },
    toggleStar: () => {
      if (!openThreadId) return;
      optimisticToggleStar([openThreadId], !isStarred);
    },
    // `l`/`v` open the label / move picker via a query-state the picker component
    // reads. armOpeningKeyGuard : l'écho de la touche d'ouverture ne doit pas
    // filtrer le combo (défense en profondeur au-delà du preventDefault).
    openLabels: () => {
      if (!openThreadId) return;
      markReplyOpened();
      armOpeningKeyGuard('l');
      setPicker('labels');
    },
    openMove: () => {
      if (!openThreadId) return;
      markReplyOpened();
      armOpeningKeyGuard('v');
      setPicker('move');
    },
    markAsRead: () => {
      if (!openThreadId) return;
      optimisticMarkAsRead([openThreadId]);
    },
    markAsUnread: () => {
      if (!openThreadId) return;
      optimisticMarkAsUnread([openThreadId]);
    },
    markAsImportant: () => {
      if (!openThreadId) return;
      optimisticToggleImportant([openThreadId], true);
    },
    markAsNotImportant: () => {
      if (!openThreadId) return;
      optimisticToggleImportant([openThreadId], false);
    },
    // r18 : mod+c — copier le lien du fil. La copie NATIVE garde la main :
    // aucun preventDefault (ligne du registre), et rien ne part dès qu'une
    // sélection existe ou que le focus est éditable.
    copyThreadLink: () => {
      if (!openThreadId) return;
      const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
      const allowed = shouldCopyThreadLink({
        threadId: openThreadId,
        hasTextSelection: Boolean(selection && !selection.isCollapsed),
        isTypingTarget: isTypingOrModalTarget(document.activeElement),
      });
      if (!allowed) return;
      void navigator.clipboard
        ?.writeText(buildThreadLink(window.location.origin, folder, openThreadId))
        .then(
          () => toast.success('Thread link copied'),
          () => toast.error('Failed to copy thread link'),
        );
    },
    // Escape hors focus composer ferme le fil ET nettoie l'état reply. Passer
    // explicitement `threadId: null` est indispensable : sans option, la purge
    // préserve volontairement le fil courant pour les changements de mode.
    closeView: () => {
      closeOpenThread();
    },
    // armOpeningKeyGuard : l'écho de la touche (a/r/f) atterrissait dans le
    // corps TipTap malgré le preventDefault du keydown (CUA round 3, échec 2).
    reply: () => {
      markReplyOpened();
      armOpeningKeyGuard('r');
      setMode('reply');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    forward: () => {
      markReplyOpened();
      armOpeningKeyGuard('f');
      setMode('forward');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    replyAll: () => {
      markReplyOpened();
      armOpeningKeyGuard('a');
      setMode('replyAll');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    delete: () => {
      if (!openThreadId) return;
      if (folder === 'bin') {
        deleteThread(openThreadId);
        setMailNavigationCommand('next');
      } else {
        moveTo({
          threadIds: [openThreadId],
          currentFolder: folder,
          destination: 'bin',
        });
        setMailNavigationCommand('next');
      }
    },
  };

  const threadDisplayShortcuts = enhancedKeyboardShortcuts.filter(
    (shortcut) => shortcut.scope === scope,
  );

  useShortcuts(threadDisplayShortcuts, handlers, { scope });

  return null;
}
