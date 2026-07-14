import type { Shortcut } from '@/config/shortcuts';

const QUEUE_NAVIGATION_ACTIONS = new Set(['focusNext', 'focusPrevious', 'openFocused', 'pageDown']);

/** Consume the canonical list-navigation rows without mutating the registry or binder. */
export function buildQueueNavigationShortcuts(shortcuts: readonly Shortcut[]): Shortcut[] {
  return shortcuts
    .filter((shortcut) => QUEUE_NAVIGATION_ACTIONS.has(shortcut.action))
    .map((shortcut) => ({
      ...shortcut,
      scope: 'queue',
      ignore: false,
      preventDefault: true,
    }));
}

export function moveQueueSelection<T extends { id: string }>(
  items: readonly T[],
  selectedId: string | null,
  direction: 'next' | 'previous',
): string | null {
  if (!items.length) return null;
  const currentIndex = items.findIndex((item) => item.id === selectedId);
  const base = currentIndex < 0 ? (direction === 'next' ? -1 : items.length) : currentIndex;
  const nextIndex =
    direction === 'next' ? Math.min(items.length - 1, base + 1) : Math.max(0, base - 1);
  return items[nextIndex]?.id ?? null;
}

export function buildQueueItemAccessibleName(input: {
  subject: string;
  fallbackSubject: string;
  status: string;
}): string {
  return `${input.subject || input.fallbackSubject}, ${input.status}`;
}

export type QueuePendingState<Action extends string = string> = Record<string, Action>;

export function setQueueItemPending<Action extends string>(
  current: QueuePendingState<Action>,
  itemId: string,
  action: Action,
): QueuePendingState<Action> {
  return { ...current, [itemId]: action };
}

export function clearQueueItemPending<Action extends string>(
  current: QueuePendingState<Action>,
  itemId: string,
): QueuePendingState<Action> {
  const next = { ...current };
  delete next[itemId];
  return next;
}
