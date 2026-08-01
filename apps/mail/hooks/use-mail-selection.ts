import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { MailSelectMode, ParsedMessage } from '@/types';
import { useMail } from '@/components/mail/use-mail';
import { useKeyState } from '@/hooks/use-hot-key';

export type MailSelectionModifiers = Pick<
  MouseEvent,
  'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'
>;

export function resolveMailSelectMode(
  modifiers: MailSelectionModifiers | undefined,
  isKeyPressed: (key: string) => boolean,
): MailSelectMode {
  // A real click event is authoritative. Global key listeners can miss keyup
  // while the window/browser changes focus, leaving Meta or Control stuck and
  // turning a later plain click into bulk selection.
  const liveAlt = isKeyPressed('Alt') || isKeyPressed('AltLeft') || isKeyPressed('AltRight');
  const liveShift =
    isKeyPressed('Shift') || isKeyPressed('ShiftLeft') || isKeyPressed('ShiftRight');
  const liveControl = isKeyPressed('Control');
  const liveMeta = isKeyPressed('Meta');
  // Pointer/AX activation occasionally arrives with a phantom modifier flag.
  // Require the corresponding live keydown too. A real human modifier-click
  // has both signals; a plain accessibility click remains a normal open.
  const isAltPressed = modifiers ? modifiers.altKey && liveAlt : liveAlt;
  const isShiftPressed = modifiers ? modifiers.shiftKey && liveShift : liveShift;
  const isCtrlPressed = modifiers
    ? (modifiers.ctrlKey && liveControl) || (modifiers.metaKey && liveMeta)
    : liveControl || liveMeta;

  if (isAltPressed && isShiftPressed) return 'selectAllBelow';
  if (isShiftPressed && !isCtrlPressed) return 'range';
  if (isCtrlPressed) return 'mass';
  return 'single';
}

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
  getSelectMode: (modifiers?: MailSelectionModifiers) => MailSelectMode;
  /** Apply the current-mode selection for the clicked message. */
  handleSelectMail: (message: ParsedMessage, mode?: MailSelectMode) => void;
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

  const getSelectMode = useCallback(
    (modifiers?: MailSelectionModifiers): MailSelectMode =>
      resolveMailSelectMode(modifiers, isKeyPressed),
    [isKeyPressed],
  );

  const handleSelectMail = useCallback(
    (message: ParsedMessage, mode?: MailSelectMode) => {
      const itemId = message.threadId ?? message.id;
      const currentMode = mode ?? getSelectMode();

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
              setAnchorIndex(clickedIndex);
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
    [getSelectMode, setMail, anchorIndex, itemsRef],
  );

  return { anchorIndex, setAnchorIndex, getSelectMode, handleSelectMail };
}
