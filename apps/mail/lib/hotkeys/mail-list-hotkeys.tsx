import { resolveRowTargetId, resolveTargetIds } from './target-resolution';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { focusedIndexAtom } from '@/hooks/use-mail-navigation';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { MAILLIST_HANDLED_ACTIONS } from './handler-manifest';
// import { useSearchValue } from '@/hooks/use-search-value';
import {
  // useLocation,
  useParams,
} from 'react-router';
import { useMail } from '@/components/mail/use-mail';
// import { Categories } from '@/components/mail/mail';
import { useShortcuts } from './use-hotkey-utils';
import { useThreads } from '@/hooks/use-threads';
// import { cleanSearchValue } from '@/lib/utils';
import { m } from '@/paraglide/messages';
import { useAtomValue } from 'jotai';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';

// Space/shift+Space paging is NOT in this scope — it is imperative in the `list` scope
// (use-mail-navigation.ts), which owns the scroll container.
export function MailListHotkeys() {
  const scope = 'mail-list';
  const [mail, setMail] = useMail();
  const [, items] = useThreads();
  const hoveredEmailId = useRef<string | null>(null);
  // const categories = Categories();
  // const [searchValue, setSearchValue] = useSearchValue();
  // const pathname = useLocation().pathname;
  const params = useParams<{ folder: string }>();
  const folder = params?.folder ?? 'inbox';
  const focusedIndex = useAtomValue(focusedIndexAtom);
  const [, setThreadId] = useQueryState('threadId');
  const [, setMode] = useQueryState('mode');

  const {
    optimisticMarkAsRead,
    optimisticMarkAsUnread,
    optimisticMoveThreadsTo,
    optimisticToggleImportant,
    optimisticDeleteThreads,
    optimisticToggleStar,
    optimisticSnooze,
  } = useOptimisticActions();

  // Devlab: hover listener restored (upstream shipped it commented out, leaving
  // single-key list actions dead unless a bulk selection existed).
  useEffect(() => {
    const handleEmailHover = (event: CustomEvent<{ id: string | null }>) => {
      hoveredEmailId.current = event.detail.id;
    };

    window.addEventListener('emailHover', handleEmailHover as EventListener);
    return () => {
      window.removeEventListener('emailHover', handleEmailHover as EventListener);
    };
  }, []);

  // Bulk selection wins for actions; without one, explicit J/K focus wins over hover.
  const getTargetIds = useCallback(
    (): string[] =>
      resolveTargetIds(hoveredEmailId.current, focusedIndex, items, mail.bulkSelected),
    [focusedIndex, items, mail.bulkSelected],
  );

  const selectAll = useCallback(() => {
    if (mail.bulkSelected.length > 0) {
      setMail((prev) => ({
        ...prev,
        bulkSelected: [],
      }));
    } else if (items.length > 0) {
      const allIds = items.map((item) => item.id);
      setMail((prev) => ({
        ...prev,
        bulkSelected: allIds,
      }));
    } else {
      toast.info(m['common.mail.noEmailsToSelect']());
    }
  }, [items, mail]);

  // Devlab: every list action targets through getTargetIds() — bulk selection, then
  // keyboard focus (j/k), then pointer hover.
  const withTargets = useCallback(
    (act: (ids: string[]) => void) => () => {
      const ids = getTargetIds();
      if (ids.length === 0) {
        toast.info(m['common.mail.noEmailsToSelect']());
        return;
      }
      act(ids);
    },
    [getTargetIds],
  );

  const markAsRead = useMemo(
    () => withTargets((ids) => optimisticMarkAsRead(ids)),
    [withTargets, optimisticMarkAsRead],
  );

  const markAsUnread = useMemo(
    () => withTargets((ids) => optimisticMarkAsUnread(ids)),
    [withTargets, optimisticMarkAsUnread],
  );

  const markAsImportant = useMemo(
    () => withTargets((ids) => optimisticToggleImportant(ids, true)),
    [withTargets, optimisticToggleImportant],
  );

  const markAsNotImportant = useMemo(
    () => withTargets((ids) => optimisticToggleImportant(ids, false)),
    [withTargets, optimisticToggleImportant],
  );

  const archiveEmail = useMemo(
    () => withTargets((ids) => optimisticMoveThreadsTo(ids, folder, 'archive')),
    [withTargets, folder, optimisticMoveThreadsTo],
  );

  const bulkDelete = useMemo(
    () => withTargets((ids) => optimisticDeleteThreads(ids, folder)),
    [withTargets, folder, optimisticDeleteThreads],
  );

  const bulkStar = useMemo(
    () => withTargets((ids) => optimisticToggleStar(ids, true)),
    [withTargets, optimisticToggleStar],
  );

  const exitSelectionMode = useCallback(() => {
    setMail((prev) => ({
      ...prev,
      bulkSelected: [],
    }));
  }, [setMail]);

  // `x` — toggle bulk selection of the focused/hovered row (Shortwave "select").
  const toggleFocusedSelection = useCallback(() => {
    const targetId = resolveRowTargetId(hoveredEmailId.current, focusedIndex, items);
    if (!targetId) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }
    setMail((prev) => ({
      ...prev,
      bulkSelected: prev.bulkSelected.includes(targetId)
        ? prev.bulkSelected.filter((existing) => existing !== targetId)
        : [...prev.bulkSelected, targetId],
    }));
  }, [focusedIndex, items, setMail]);

  // Devlab — Superhuman-style keys. Open the targeted thread directly in a
  // compose mode; ThreadDisplay resolves the reply target to the latest message.
  const openTargetInMode = useCallback(
    (mode: 'reply' | 'replyAll' | 'forward') => {
      const [targetId] = getTargetIds();
      if (!targetId) {
        toast.info(m['common.mail.noEmailsToSelect']());
        return;
      }
      setThreadId(targetId);
      setMode(mode);
    },
    [getTargetIds, setMode, setThreadId],
  );

  const replyToThread = useCallback(() => openTargetInMode('reply'), [openTargetInMode]);
  const replyAllToThread = useCallback(() => openTargetInMode('replyAll'), [openTargetInMode]);
  const forwardThread = useCallback(() => openTargetInMode('forward'), [openTargetInMode]);

  // Devlab: h = remind — snooze to tomorrow 08:00 (undo with mod+z, toast confirms).
  const remindThread = useCallback(() => {
    const ids = getTargetIds();
    if (!ids.length) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }
    const wakeAt = new Date();
    wakeAt.setDate(wakeAt.getDate() + 1);
    wakeAt.setHours(8, 0, 0, 0);
    optimisticSnooze(ids, folder, wakeAt);
  }, [getTargetIds, folder, optimisticSnooze]);

  // const switchMailListCategory = useCallback(
  //   (category: string | null) => {
  //     if (pathname?.includes('/mail/inbox')) {
  //       const cat = categories.find((cat) => cat.id === category);
  //       if (!cat) {
  //         // setCategory(null);
  //         setSearchValue({
  //           value: '',
  //           highlight: searchValue.highlight,
  //           folder: '',
  //         });
  //         return;
  //       }
  //       // setCategory(cat.id);
  //       setSearchValue({
  //         value: `${cat.searchValue} ${cleanSearchValue(searchValue.value).trim().length ? `AND ${cleanSearchValue(searchValue.value)}` : ''}`,
  //         highlight: searchValue.highlight,
  //         folder: '',
  //       });
  //     }
  //   },
  //   [categories, pathname, searchValue, setSearchValue],
  // );

  // const switchCategoryByIndex = useCallback(
  //   (idx: number) => {
  //     const cat = categories[idx];
  //     if (!cat) return;
  //     switchMailListCategory(cat.id);
  //   },
  //   [categories, switchMailListCategory],
  // );

  const handlers: Record<(typeof MAILLIST_HANDLED_ACTIONS)[number], () => void> = useMemo(
    () => ({
      markAsRead,
      markAsUnread,
      markAsImportant,
      markAsNotImportant,
      toggleFocusedSelection,
      selectAll,
      archiveEmail,
      bulkDelete,
      bulkStar,
      exitSelectionMode,
      replyToThread,
      replyAllToThread,
      forwardThread,
      remindThread,
    }),
    [
      markAsRead,
      markAsUnread,
      markAsImportant,
      markAsNotImportant,
      toggleFocusedSelection,
      selectAll,
      archiveEmail,
      bulkDelete,
      bulkStar,
      exitSelectionMode,
      replyToThread,
      replyAllToThread,
      forwardThread,
      remindThread,
    ],
  );

  const mailListShortcuts = enhancedKeyboardShortcuts.filter(
    (shortcut) => shortcut.scope === scope,
  );

  useShortcuts(mailListShortcuts, handlers, { scope });

  return null;
}
