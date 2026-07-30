import { focusedIndexAtom, mailNavigationCommandAtom } from '@/hooks/use-mail-navigation';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { THREAD_DISPLAY_HANDLED_ACTIONS } from './handler-manifest';
import { useReplyStatePurge } from '@/hooks/use-reply-state-purge';
import { selectArchiveAdvanceTarget } from '@/lib/archive-advance';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { markReplyOpened } from '@/lib/reply-search-params';
import { useThread, useThreads } from '@/hooks/use-threads';
import { armOpeningKeyGuard } from './opening-key-guard';
import useMoveTo from '@/hooks/driver/use-move-to';
import useDelete from '@/hooks/driver/use-delete';
import { useShortcuts } from './use-hotkey-utils';
import { useParams } from 'react-router';
import { useQueryState } from 'nuqs';
import { useSetAtom } from 'jotai';

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
  const purgeReplyState = useReplyStatePurge();
  const {
    optimisticMoveThreadsTo,
    optimisticSnooze,
    optimisticMarkAsRead,
    optimisticMarkAsUnread,
    optimisticToggleImportant,
    optimisticToggleStar,
  } = useOptimisticActions();

  const folder = params.folder ?? 'inbox';
  const tags = thread?.latest?.tags;
  const isStarred = tags?.some((tag) => tag.name === 'STARRED') ?? false;

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
    archive: () => archiveAndMove('next'),
    archiveNext: () => archiveAndMove('next'),
    archivePrevious: () => archiveAndMove('previous'),
    // Devlab: h/b = remind — snooze to tomorrow 08:00 and move on (undo: mod+z).
    remind: () => {
      if (!openThreadId) return;
      const wakeAt = new Date();
      wakeAt.setDate(wakeAt.getDate() + 1);
      wakeAt.setHours(8, 0, 0, 0);
      optimisticSnooze([openThreadId], folder, wakeAt);
      setMailNavigationCommand('next');
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
    // Escape hors focus composer : use-mail-navigation ferme le fil
    // (setThreadId(null)) mais ne nettoie pas l'état reply — un mode résiduel
    // réarmait activeReplyId au fil suivant, qui s'ouvrait en reply. Purge
    // ATOMIQUE (une écriture d'URL) — voir use-reply-state-purge.
    closeView: () => {
      void purgeReplyState();
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
