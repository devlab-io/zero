export const OUTBOX_STATUSES = [
  'queued',
  'generating',
  'draft_ready',
  'approved',
  'sending',
  'sent',
  'cancelled',
  'no_reply_needed',
  'failed',
] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const QUEUE_DISPLAY_STATUSES: readonly OutboxStatus[] = [
  'draft_ready',
  'generating',
  'queued',
  'failed',
  'approved',
  'sending',
  'no_reply_needed',
  'sent',
  'cancelled',
];

export type OutboxItemLike = {
  id: string;
  status: OutboxStatus;
  reviewState?: 'pending' | 'revision_requested' | 'revising' | 'ready' | 'stale' | 'failed';
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

export const getOutboxDisplayStatus = (item: OutboxItemLike): OutboxStatus =>
  item.reviewState === 'failed' && item.status !== 'draft_ready' ? 'failed' : item.status;

export const groupOutboxItemsByStatus = <T extends OutboxItemLike>(
  items: readonly T[],
): OutboxItemsByStatus<T> => {
  const grouped = OUTBOX_STATUSES.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {} as OutboxItemsByStatus<T>);

  for (const item of items) {
    grouped[getOutboxDisplayStatus(item)].push(item);
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
