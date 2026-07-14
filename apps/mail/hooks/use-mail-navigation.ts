import { isTypingOrModalTarget } from '@/lib/hotkeys/use-hotkey-utils';
import { useOptimisticActions } from './use-optimistic-actions';
import { useCallback, useEffect, useRef } from 'react';
import { useMail } from '@/components/mail/use-mail';
import { useHotkeys } from 'react-hotkeys-hook';
import { atom, useAtom } from 'jotai';
import { useQueryState } from 'nuqs';

export const focusedIndexAtom = atom<number | null>(null);

export type ThreadRemovalDirection = 'next' | 'previous';

export type ThreadRemovalNavigation = {
  threadId: string | null;
  focusedIndex: number | null;
};

type RunThreadRemovalNavigationOptions = {
  items: readonly { id: string }[];
  currentId: string;
  direction?: ThreadRemovalDirection;
  mutate: () => void;
  setThreadId: (threadId: string | null) => void;
  setFocusedIndex: (index: number | null) => void;
};

/**
 * Resolve the target from the immutable pre-mutation list, run the mutation (which may clear the
 * active thread internally), then restore URL identity and focus from the precomputed target.
 */
export function runThreadRemovalNavigation({
  items,
  currentId,
  direction = 'next',
  mutate,
  setThreadId,
  setFocusedIndex,
}: RunThreadRemovalNavigationOptions): ThreadRemovalNavigation {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  const targetIndex =
    currentIndex < 0 ? -1 : direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  const target = targetIndex < 0 ? undefined : items[targetIndex];
  const navigation = target
    ? {
        threadId: target.id,
        focusedIndex: direction === 'next' ? currentIndex : currentIndex - 1,
      }
    : { threadId: null, focusedIndex: null };

  mutate();
  setThreadId(navigation.threadId);
  setFocusedIndex(navigation.focusedIndex);
  return navigation;
}

// The imperative `list` scope (registry rows flagged `ignore`) is bound below via
// react-hotkeys-hook — not through the generic registry binder — because these keys need
// the live list container + repeat handling. Their action names live in
// lib/hotkeys/handler-manifest.ts (LIST_IMPERATIVE_ACTIONS), which the coverage test checks.

/** How many rows Space / shift+Space jump the focus (focus-based paging). */
const PAGE_STEP = 10;

export interface UseMailNavigationProps {
  items: { id: string }[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: (threadId: string | null) => void;
}

export function useMailNavigation({ items, containerRef, onNavigate }: UseMailNavigationProps) {
  const [, setMail] = useMail();
  const [focusedIndex, setFocusedIndex] = useAtom(focusedIndexAtom);
  const { optimisticMarkAsRead } = useOptimisticActions();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const [threadId] = useQueryState('threadId');
  const [isCommandPaletteOpen] = useQueryState('isCommandPaletteOpen');

  const hoveredMailRef = useRef<string | null>(null);
  const keyboardActiveRef = useRef(false);
  const lastMoveTime = useRef(0);

  useEffect(() => {
    if (!keyboardActiveRef.current) {
      //   setFocusedIndex(null);
    }
  }, [items, setFocusedIndex]);

  const resetNavigation = useCallback(() => {
    setFocusedIndex(null);
    onNavigateRef.current(null);
    keyboardActiveRef.current = false;
  }, [setFocusedIndex, onNavigateRef]);

  const getThreadElement = useCallback(
    (index: number | null) => {
      if (index === null || !containerRef.current) return null;
      return containerRef.current.querySelector(
        `[data-thread-id="${itemsRef.current[index]?.id}"]`,
      ) as HTMLElement | null;
    },
    [containerRef],
  );

  const scrollIntoView = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const threadElement = getThreadElement(index);
      if (!threadElement || !containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const threadRect = threadElement.getBoundingClientRect();

      if (threadRect.top < containerRect.top || threadRect.bottom > containerRect.bottom) {
        threadElement.scrollIntoView({
          block: 'nearest',
          behavior,
        });
      }
    },
    [containerRef, getThreadElement],
  );

  const navigateToThread = useCallback(
    (index: number) => {
      if (index === null || !itemsRef.current[index]) return;

      const message = itemsRef.current[index];
      const threadId = message.id;

      if (threadId) {
        onNavigateRef.current(threadId);
        optimisticMarkAsRead([threadId], true);
      }

      setMail((prev) => ({
        ...prev,
        bulkSelected: [],
      }));
    },
    [setMail, threadId],
  );

  const getHoveredIndex = useCallback(() => {
    if (!hoveredMailRef.current) return -1;
    return itemsRef.current.findIndex((item) => item.id === hoveredMailRef.current);
  }, []);

  const moveFocus = useCallback(
    (direction: 'up' | 'down') => {
      keyboardActiveRef.current = true;

      setFocusedIndex((prevIndex) => {
        let newIndex: number;
        if (prevIndex === null) {
          const hoveredIndex = getHoveredIndex();
          if (hoveredIndex !== -1) {
            newIndex = hoveredIndex;
          } else {
            newIndex = direction === 'up' ? itemsRef.current.length - 1 : 0;
          }
        } else {
          newIndex =
            direction === 'up'
              ? Math.max(0, prevIndex - 1)
              : Math.min(itemsRef.current.length - 1, prevIndex + 1);
        }

        if (newIndex === prevIndex && prevIndex !== null) return prevIndex;

        scrollIntoView(newIndex, 'smooth');
        navigateToThread(newIndex);
        return newIndex;
      });
    },
    [setFocusedIndex, getHoveredIndex, scrollIntoView, navigateToThread],
  );

  const handleArrowUp = useCallback(() => {
    moveFocus('up');
  }, [moveFocus]);

  const handleArrowDown = useCallback(() => {
    moveFocus('down');
  }, [moveFocus]);

  const handleEnter = useCallback(() => {
    if (focusedIndex === null) return;

    const message = itemsRef.current[focusedIndex];
    if (message) onNavigateRef.current(message.id);
  }, [focusedIndex]);

  const handleEscape = useCallback(() => {
    setFocusedIndex(null);
    onNavigateRef.current(null);
    keyboardActiveRef.current = false;
  }, [setFocusedIndex, onNavigateRef]);

  // Space / shift+Space — page the focus by a screenful (focus-based paging; the real
  // virtua scroller lives in mail-list.tsx which is out of scope for #32).
  const pageFocus = useCallback(
    (direction: 'up' | 'down') => {
      keyboardActiveRef.current = true;
      setFocusedIndex((prevIndex) => {
        const { length } = itemsRef.current;
        if (length === 0) return prevIndex;
        const base = prevIndex ?? (direction === 'down' ? -1 : length);
        const newIndex =
          direction === 'down'
            ? Math.min(length - 1, base + PAGE_STEP)
            : Math.max(0, base - PAGE_STEP);
        if (newIndex === prevIndex) return prevIndex;
        scrollIntoView(newIndex, 'auto');
        navigateToThread(newIndex);
        return newIndex;
      });
    },
    [scrollIntoView, navigateToThread, setFocusedIndex],
  );

  // Single-key list commands must stay inert while typing or inside a dialog (frozen
  // check #4). react-hotkeys-hook already excludes form/contenteditable targets; the
  // explicit guard also covers open dialogs.
  const handleCloseLeft = useCallback(
    (event: KeyboardEvent) => {
      if (isTypingOrModalTarget(event.target)) return;
      handleEscape();
    },
    [handleEscape],
  );
  const handlePageDown = useCallback(
    (event: KeyboardEvent) => {
      if (isTypingOrModalTarget(event.target)) return;
      pageFocus('down');
    },
    [pageFocus],
  );
  const handlePageUp = useCallback(
    (event: KeyboardEvent) => {
      if (isTypingOrModalTarget(event.target)) return;
      pageFocus('up');
    },
    [pageFocus],
  );

  useHotkeys('ArrowUp', handleArrowUp, { preventDefault: true, enabled: !isCommandPaletteOpen });
  useHotkeys('ArrowDown', handleArrowDown, {
    preventDefault: true,
    enabled: !isCommandPaletteOpen,
  });
  useHotkeys('j', handleArrowDown, { enabled: !isCommandPaletteOpen });
  useHotkeys('k', handleArrowUp, { enabled: !isCommandPaletteOpen });
  useHotkeys('Enter', handleEnter, { preventDefault: true, enabled: !isCommandPaletteOpen });
  useHotkeys('Escape', handleEscape, { preventDefault: true, enabled: !isCommandPaletteOpen });
  useHotkeys('ArrowLeft', handleCloseLeft, {
    preventDefault: true,
    enabled: !isCommandPaletteOpen,
  });
  useHotkeys('space', handlePageDown, { preventDefault: true, enabled: !isCommandPaletteOpen });
  useHotkeys('shift+space', handlePageUp, { preventDefault: true, enabled: !isCommandPaletteOpen });

  const handleMouseEnter = useCallback(
    (threadId: string) => {
      hoveredMailRef.current = threadId;

      if (keyboardActiveRef.current) {
        // setFocusedIndex(null);
        keyboardActiveRef.current = false;
      }
    },
    [setFocusedIndex],
  );

  const fastScroll = useCallback(
    (direction: 'up' | 'down') => {
      setFocusedIndex((prev) => {
        const { length } = itemsRef.current;
        const newIndex =
          direction === 'up'
            ? prev === null
              ? length - 1
              : Math.max(0, prev - 1)
            : prev === null
              ? 0
              : Math.min(length - 1, prev + 1);

        if (newIndex !== prev || prev === null) {
          scrollIntoView(newIndex, 'auto');
        }
        return newIndex;
      });
    },
    [scrollIntoView, setFocusedIndex],
  );

  useEffect(() => {
    let isProcessingKey = false;
    const MOVE_DELAY = 100;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isCommandPaletteOpen) return;
      if (!event.repeat) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

      event.preventDefault();

      const now = Date.now();
      if (now - lastMoveTime.current < MOVE_DELAY) return;

      if (isProcessingKey) return;
      isProcessingKey = true;
      lastMoveTime.current = now;

      requestAnimationFrame(() => {
        if (event.key === 'ArrowUp') {
          fastScroll('up');
        } else if (event.key === 'ArrowDown') {
          fastScroll('down');
        }
        isProcessingKey = false;
      });
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fastScroll, isCommandPaletteOpen]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      keyboardActiveRef.current = false;
    }
  }, [isCommandPaletteOpen]);

  return {
    focusedIndex,
    handleMouseEnter,
    keyboardActive: keyboardActiveRef.current,
    resetNavigation,
  };
}
