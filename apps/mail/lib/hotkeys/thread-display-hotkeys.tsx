import { mailNavigationCommandAtom } from '@/hooks/use-mail-navigation';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
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

export function ThreadDisplayHotkeys() {
  const scope = 'thread-display';
  const [, setMode] = useQueryState('mode');
  const [, setActiveReplyId] = useQueryState('activeReplyId');
  const [openThreadId] = useQueryState('threadId');
  const { data: thread } = useThread(openThreadId);
  const params = useParams<{
    folder: string;
  }>();
  const { mutate: deleteThread } = useDelete();
  const { mutate: moveTo } = useMoveTo();
  const setMailNavigationCommand = useSetAtom(mailNavigationCommandAtom);
  const { optimisticMoveThreadsTo, optimisticSnooze } = useOptimisticActions();

  const handlers = {
    // Devlab: d = done — archive the open thread and move to the next one.
    archive: () => {
      if (!openThreadId) return;
      optimisticMoveThreadsTo([openThreadId], params.folder ?? 'inbox', 'archive');
      setMailNavigationCommand('next');
    },
    // Devlab: h = remind — snooze to tomorrow 08:00 and move on (undo: mod+z).
    remind: () => {
      if (!openThreadId) return;
      const wakeAt = new Date();
      wakeAt.setDate(wakeAt.getDate() + 1);
      wakeAt.setHours(8, 0, 0, 0);
      optimisticSnooze([openThreadId], params.folder ?? 'inbox', wakeAt);
      setMailNavigationCommand('next');
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
      if (params.folder === 'bin') {
        deleteThread(openThreadId);
        setMailNavigationCommand('next');
      } else {
        moveTo({
          threadIds: [openThreadId],
          currentFolder: params.folder ?? 'inbox',
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
