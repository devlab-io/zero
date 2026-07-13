import { mailNavigationCommandAtom } from '@/hooks/use-mail-navigation';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { THREAD_DISPLAY_HANDLED_ACTIONS } from './handler-manifest';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import useMoveTo from '@/hooks/driver/use-move-to';
import useDelete from '@/hooks/driver/use-delete';
import { useShortcuts } from './use-hotkey-utils';
import { useThread } from '@/hooks/use-threads';
import { useParams } from 'react-router';
import { useQueryState } from 'nuqs';
import { useSetAtom } from 'jotai';

const closeView = (event: KeyboardEvent) => {
  event.preventDefault();
};

// `openLabels`/`openMove` are absent by design (no picker surface reachable in #32's
// may-touch — see shortcuts.ts).
export function ThreadDisplayHotkeys() {
  const scope = 'thread-display';
  const [, setMode] = useQueryState('mode');
  const [, setActiveReplyId] = useQueryState('activeReplyId');
  const [, setPicker] = useQueryState('picker');
  const [openThreadId] = useQueryState('threadId');
  const { data: thread } = useThread(openThreadId);
  const params = useParams<{
    folder: string;
  }>();
  const { mutate: deleteThread } = useDelete();
  const { mutate: moveTo } = useMoveTo();
  const setMailNavigationCommand = useSetAtom(mailNavigationCommandAtom);
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

  // Devlab: d/e/[ = done — archive the open thread and move on. `]` archives and opens
  // the PREVIOUS item (use-mail-navigation consumes the 'previous' command).
  const archiveAndMove = (command: 'next' | 'previous') => {
    if (!openThreadId) return;
    optimisticMoveThreadsTo([openThreadId], folder, 'archive');
    setMailNavigationCommand(command);
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
    // `l`/`v` open the label / move picker via a query-state the picker component reads.
    openLabels: () => {
      if (!openThreadId) return;
      setPicker('labels');
    },
    openMove: () => {
      if (!openThreadId) return;
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
    closeView: () => closeView(new KeyboardEvent('keydown', { key: 'Escape' })),
    reply: () => {
      setMode('reply');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    forward: () => {
      setMode('forward');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    replyAll: () => {
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
