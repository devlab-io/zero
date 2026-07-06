import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { focusedIndexAtom } from '@/hooks/use-mail-navigation';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
// import { useSearchValue } from '@/hooks/use-search-value';
import {
  // useLocation,
  useParams,
} from 'react-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMail } from '@/components/mail/use-mail';
// import { Categories } from '@/components/mail/mail';
import { useShortcuts } from './use-hotkey-utils';
import { useThreads } from '@/hooks/use-threads';
// import { cleanSearchValue } from '@/lib/utils';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
import { useAtomValue } from 'jotai';
import { toast } from 'sonner';

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
  const shouldUseHover = mail.bulkSelected.length === 0;
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

  // Devlab: resolve the action target — priority: hover, then keyboard focus (j/k),
  // then bulk selection. Returns [] when nothing is targeted.
  const getTargetIds = useCallback((): string[] => {
    if (shouldUseHover && hoveredEmailId.current) return [hoveredEmailId.current];
    if (shouldUseHover && focusedIndex !== null && items[focusedIndex])
      return [items[focusedIndex].id];
    return mail.bulkSelected;
  }, [shouldUseHover, focusedIndex, items, mail.bulkSelected]);

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

  const markAsRead = useCallback(() => {
    if (shouldUseHover && hoveredEmailId.current) {
      optimisticMarkAsRead([hoveredEmailId.current]);
      return;
    }

    const idsToMark = mail.bulkSelected;
    if (idsToMark.length === 0) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }

    optimisticMarkAsRead(idsToMark);
  }, [mail.bulkSelected, optimisticMarkAsRead, shouldUseHover]);

  const markAsUnread = useCallback(() => {
    if (shouldUseHover && hoveredEmailId.current) {
      optimisticMarkAsUnread([hoveredEmailId.current]);
      return;
    }

    const idsToMark = mail.bulkSelected;
    if (idsToMark.length === 0) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }

    optimisticMarkAsUnread(idsToMark);
  }, [mail.bulkSelected, optimisticMarkAsUnread, shouldUseHover]);

  const markAsImportant = useCallback(() => {
    if (shouldUseHover && hoveredEmailId.current) {
      optimisticToggleImportant([hoveredEmailId.current], true);
      return;
    }

    const idsToMark = mail.bulkSelected;
    if (idsToMark.length === 0) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }

    optimisticToggleImportant(idsToMark, true);
  }, [mail.bulkSelected, optimisticToggleImportant, shouldUseHover]);

  const archiveEmail = useCallback(async () => {
    if (shouldUseHover && hoveredEmailId.current) {
      optimisticMoveThreadsTo([hoveredEmailId.current], folder, 'archive');
      return;
    }

    const idsToArchive = mail.bulkSelected;
    if (idsToArchive.length === 0) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }

    optimisticMoveThreadsTo(idsToArchive, folder, 'archive');
  }, [mail.bulkSelected, folder, optimisticMoveThreadsTo, shouldUseHover]);

  const bulkArchive = useCallback(() => {
    if (shouldUseHover && hoveredEmailId.current) {
      optimisticMoveThreadsTo([hoveredEmailId.current], folder, 'archive');
      return;
    }

    const idsToArchive = mail.bulkSelected;
    if (idsToArchive.length === 0) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }

    optimisticMoveThreadsTo(idsToArchive, folder, 'archive');
  }, [mail.bulkSelected, folder, optimisticMoveThreadsTo, shouldUseHover]);

  const bulkDelete = useCallback(() => {
    if (shouldUseHover && hoveredEmailId.current) {
      optimisticDeleteThreads([hoveredEmailId.current], folder);
      return;
    }

    const idsToDelete = mail.bulkSelected;
    if (idsToDelete.length === 0) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }

    optimisticDeleteThreads(idsToDelete, folder);
  }, [mail.bulkSelected, folder, optimisticDeleteThreads, shouldUseHover]);

  const bulkStar = useCallback(() => {
    if (shouldUseHover && hoveredEmailId.current) {
      optimisticToggleStar([hoveredEmailId.current], true);
      return;
    }

    const idsToStar = mail.bulkSelected;
    if (idsToStar.length === 0) {
      toast.info(m['common.mail.noEmailsToSelect']());
      return;
    }

    optimisticToggleStar(idsToStar, true);
  }, [mail.bulkSelected, optimisticToggleStar, shouldUseHover]);

  const exitSelectionMode = useCallback(() => {
    setMail((prev) => ({
      ...prev,
      bulkSelected: [],
    }));
  }, [shouldUseHover]);

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

  const handlers = useMemo(
    () => ({
      markAsRead,
      markAsUnread,
      markAsImportant,
      selectAll,
      archiveEmail,
      bulkArchive,
      bulkDelete,
      bulkStar,
      exitSelectionMode,
      replyToThread,
      replyAllToThread,
      forwardThread,
      remindThread,
      // showImportant: () => switchCategoryByIndex(0),
      // showAllMail: () => switchCategoryByIndex(1),
      // showPersonal: () => switchCategoryByIndex(2),
      // showUpdates: () => switchCategoryByIndex(3),
      // showPromotions: () => switchCategoryByIndex(4),
      // showUnread: () => switchCategoryByIndex(5),
    }),
    [
      // switchCategoryByIndex,
      markAsRead,
      markAsUnread,
      markAsImportant,
      selectAll,
      archiveEmail,
      bulkArchive,
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
