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
