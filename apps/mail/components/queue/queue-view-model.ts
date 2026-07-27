export const OUTBOX_STATUSES = [
  'queued',
  'generating',
  'draft_ready',
  'approved',
  'sending',
  'sent',
  'cancelled',
  'failed',
  /**
   * Envoi ÉMIS, issue INCONNUE. Distinct de `failed` parce que `failed` est rejouable et
   * qu'un rejeu après acceptation renverrait le mail. Aucun bouton d'action ne doit être
   * proposé sur cet état : il est terminal côté serveur (`retry` le refuse), et l'afficher
   * comme réparable serait mentir à l'utilisateur.
   */
  'unresolved',
] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export type OutboxItemLike = {
  id: string;
  status: OutboxStatus;
  scheduledSendAt?: Date | string | null;
};

export type OutboxItemsByStatus<T extends OutboxItemLike> = Record<OutboxStatus, T[]>;

export const CANCELABLE_STATUSES = new Set<OutboxStatus>([
  'queued',
  'generating',
  'draft_ready',
  'approved',
]);

export const APPROVABLE_STATUSES = new Set<OutboxStatus>(['draft_ready']);

/**
 * Seul `failed` est rejouable, et il ne l'est que parce que la non-acceptation y est
 * PROUVÉE. `unresolved` en est exclu par construction : c'est la moitié cliente du verrou
 * posé côté serveur, où `retryDraftOutboxItem` exige déjà le statut `failed`.
 */
export const RETRYABLE_STATUSES = new Set<OutboxStatus>(['failed']);

export const groupOutboxItemsByStatus = <T extends OutboxItemLike>(
  items: readonly T[],
): OutboxItemsByStatus<T> => {
  const grouped = OUTBOX_STATUSES.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {} as OutboxItemsByStatus<T>);

  for (const item of items) {
    grouped[item.status].push(item);
  }

  return grouped;
};

export const getReviewPendingCount = <T extends OutboxItemLike>(grouped: OutboxItemsByStatus<T>) =>
  grouped.draft_ready.length;

export const getUndoSecondsRemaining = (item: OutboxItemLike, now: Date = new Date()): number => {
  if (item.status !== 'approved' || !item.scheduledSendAt) return 0;

  const scheduledSendAt =
    item.scheduledSendAt instanceof Date ? item.scheduledSendAt : new Date(item.scheduledSendAt);
  const remainingMs = scheduledSendAt.getTime() - now.getTime();

  return Math.max(0, Math.ceil(remainingMs / 1000));
};
