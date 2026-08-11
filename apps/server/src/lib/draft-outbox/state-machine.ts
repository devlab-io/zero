import { assertMeaningfulEmailBody } from '../send-content-guard';

export const draftOutboxStatuses = [
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

export type DraftOutboxStatus = (typeof draftOutboxStatuses)[number];

export interface DraftOutboxItem {
  id: string;
  connectionId: string;
  triageRunId?: string | null;
  threadId?: string | null;
  mission?: string | null;
  status: DraftOutboxStatus;
  gmailDraftId?: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  sourceAttachments: Array<{ filename: string; mimeType: string; size: number }>;
  classification: 'reply_needed' | 'no_reply_needed';
  classificationReason?: string | null;
  generationMode: 'server' | 'codex';
  reviewState: 'pending' | 'revision_requested' | 'revising' | 'ready' | 'stale' | 'failed';
  contentRevision: number;
  contentDigest: string;
  idempotencyKey: string;
  scheduledSendAt?: Date | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DraftOutboxTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftOutboxTransitionError';
  }
}

const cancellableStatuses = new Set<DraftOutboxStatus>([
  'queued',
  'generating',
  'draft_ready',
  'approved',
]);

const failFromStatuses = new Set<DraftOutboxStatus>([
  'queued',
  'generating',
  'draft_ready',
  'approved',
  'sending',
]);

const terminalStatuses = new Set<DraftOutboxStatus>(['sent', 'cancelled', 'no_reply_needed']);

const withUpdate = (
  item: DraftOutboxItem,
  update: Partial<DraftOutboxItem>,
  now: Date = new Date(),
): DraftOutboxItem => ({
  ...item,
  ...update,
  updatedAt: now,
});

const rejectTerminal = (item: DraftOutboxItem) => {
  if (terminalStatuses.has(item.status)) {
    throw new DraftOutboxTransitionError(`Draft outbox item ${item.id} is terminal`);
  }
};

const requireStatus = (item: DraftOutboxItem, expected: DraftOutboxStatus, action: string) => {
  if (item.status !== expected) {
    throw new DraftOutboxTransitionError(
      `${action} requires status ${expected}; received ${item.status}`,
    );
  }
};

export const beginGeneratingDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  requireStatus(item, 'queued', 'beginGeneratingDraftOutboxItem');
  return withUpdate(item, { status: 'generating', error: null }, now);
};

export const markDraftOutboxItemReady = (
  item: DraftOutboxItem,
  draft: { gmailDraftId: string; subject?: string; body?: string },
  now: Date = new Date(),
): DraftOutboxItem => {
  requireStatus(item, 'generating', 'markDraftOutboxItemReady');
  if (!draft.gmailDraftId) {
    throw new DraftOutboxTransitionError('markDraftOutboxItemReady requires gmailDraftId');
  }

  return withUpdate(
    item,
    {
      status: 'draft_ready',
      gmailDraftId: draft.gmailDraftId,
      subject: draft.subject ?? item.subject,
      body: draft.body ?? item.body,
      reviewState: 'ready',
      scheduledSendAt: null,
      error: null,
    },
    now,
  );
};

export const approveDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
  countdownMs = 15_000,
): DraftOutboxItem => {
  requireStatus(item, 'draft_ready', 'approveDraftOutboxItem');
  if (!item.gmailDraftId) {
    throw new DraftOutboxTransitionError('approveDraftOutboxItem requires gmailDraftId');
  }
  if (item.reviewState !== 'ready') {
    throw new DraftOutboxTransitionError('approveDraftOutboxItem requires reviewState ready');
  }
  try {
    assertMeaningfulEmailBody(item.body);
  } catch {
    throw new DraftOutboxTransitionError('approveDraftOutboxItem requires a non-empty email body');
  }

  return withUpdate(
    item,
    {
      status: 'approved',
      scheduledSendAt: new Date(now.getTime() + countdownMs),
      error: null,
    },
    now,
  );
};

export const cancelDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  if (!cancellableStatuses.has(item.status)) {
    throw new DraftOutboxTransitionError(
      `cancelDraftOutboxItem requires queued, generating, draft_ready, or approved; received ${item.status}`,
    );
  }

  return withUpdate(item, { status: 'cancelled', scheduledSendAt: null }, now);
};

export const retryDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  requireStatus(item, 'failed', 'retryDraftOutboxItem');
  return withUpdate(
    item,
    {
      status: 'queued',
      gmailDraftId: null,
      scheduledSendAt: null,
      error: null,
    },
    now,
  );
};

export const beginSendingDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  rejectTerminal(item);
  requireStatus(item, 'approved', 'beginSendingDraftOutboxItem');
  if (!item.gmailDraftId) {
    throw new DraftOutboxTransitionError('beginSendingDraftOutboxItem requires gmailDraftId');
  }
  try {
    assertMeaningfulEmailBody(item.body);
  } catch {
    throw new DraftOutboxTransitionError(
      'beginSendingDraftOutboxItem requires a non-empty email body',
    );
  }

  return withUpdate(item, { status: 'sending', error: null }, now);
};

export const markDraftOutboxItemSent = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  rejectTerminal(item);
  requireStatus(item, 'sending', 'markDraftOutboxItemSent');
  if (!item.gmailDraftId) {
    throw new DraftOutboxTransitionError('markDraftOutboxItemSent requires gmailDraftId');
  }

  return withUpdate(item, { status: 'sent', scheduledSendAt: null, error: null }, now);
};

export const failDraftOutboxItem = (
  item: DraftOutboxItem,
  error: string,
  now: Date = new Date(),
): DraftOutboxItem => {
  if (!failFromStatuses.has(item.status)) {
    throw new DraftOutboxTransitionError(
      `failDraftOutboxItem cannot fail item from ${item.status}`,
    );
  }

  return withUpdate(item, { status: 'failed', scheduledSendAt: null, error }, now);
};
