import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { MailSelectMode, ParsedMessage } from '@/types';
import { useMail } from '@/components/mail/use-mail';
import { useKeyState } from '@/hooks/use-hot-key';

/**
 * Selection layer for the mail list: owns the bulk-selection anchor and resolves
 * the active selection mode from the modifier keys, then applies mass / range /
 * selectAllBelow / single selection into the shared `useMail` store. Extracted
 * verbatim from `MailList`; behaviour is unchanged.
 */
export interface MailSelection {
  /** Anchor index for range selection (null until a range is started). */
  anchorIndex: number | null;
  setAnchorIndex: (index: number | null) => void;
  /** Current selection mode derived from held modifier keys. */
  getSelectMode: () => MailSelectMode;
  /** Apply the current-mode selection for the clicked message. */
  handleSelectMail: (message: ParsedMessage) => void;
}

export function useMailSelection<T extends { id: string }>(
  itemsRef: RefObject<T[]>,
): MailSelection {
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [, setMail] = useMail();
  const isKeyPressed = useKeyState();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAnchorIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setAnchorIndex]);

  const getSelectMode = useCallback((): MailSelectMode => {
    const isAltPressed =
      isKeyPressed('Alt') || isKeyPressed('AltLeft') || isKeyPressed('AltRight');
    const isShiftPressed =
      isKeyPressed('Shift') || isKeyPressed('ShiftLeft') || isKeyPressed('ShiftRight');
    const isCtrlPressed = isKeyPressed('Control') || isKeyPressed('Meta');

    if (isShiftPressed && !isCtrlPressed) {
      return 'range';
    }
    if (isCtrlPressed) {
      return 'mass';
    }
    if (isAltPressed && isShiftPressed) {
      return 'selectAllBelow';
    }
    return 'single';
  }, [isKeyPressed]);

  const handleSelectMail = useCallback(
    (message: ParsedMessage) => {
      const itemId = message.threadId ?? message.id;
      const currentMode = getSelectMode();

      setMail((prevMail) => {
        const mail = prevMail;
        const clickedIndex = itemsRef.current.findIndex((item) => item.id === itemId);
        if (clickedIndex === -1) return mail;

        switch (currentMode) {
          case 'mass': {
            const newSelected = mail.bulkSelected.includes(itemId)
              ? mail.bulkSelected.filter((id) => id !== itemId)
              : [...mail.bulkSelected, itemId];
            return { ...mail, bulkSelected: newSelected };
          }
          case 'selectAllBelow': {
            const clickedIndex = itemsRef.current.findIndex((item) => item.id === itemId);
            if (clickedIndex !== -1) {
              const itemsBelow = itemsRef.current.slice(clickedIndex);
              const idsBelow = itemsBelow.map((item) => item.id);
              return { ...mail, bulkSelected: idsBelow };
            }
            return { ...mail, bulkSelected: [itemId] };
          }
          case 'range': {
            if (anchorIndex === null) {
              return { ...mail, bulkSelected: [itemId] };
            }
            const start = Math.min(anchorIndex, clickedIndex);
            const end = Math.max(anchorIndex, clickedIndex);
            const rangeIds = itemsRef.current.slice(start, end + 1).map((item) => item.id);
            const newSelected = [...new Set([...mail.bulkSelected, ...rangeIds])];

            return { ...mail, bulkSelected: newSelected };
          }
          default: {
            return { ...mail, bulkSelected: [itemId] };
          }
        }
      });
    },
    [getSelectMode, setMail, anchorIndex],
  );

  return { anchorIndex, setAnchorIndex, getSelectMode, handleSelectMail };
}
