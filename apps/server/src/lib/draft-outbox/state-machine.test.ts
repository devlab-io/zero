import {
  approveDraftOutboxItem,
  beginSendingDraftOutboxItem,
  cancelDraftOutboxItem,
  markDraftOutboxItemSent,
  retryDraftOutboxItem,
  type DraftOutboxItem,
} from './state-machine';
import { describe, expect, it } from 'vitest';

const baseItem = (overrides: Partial<DraftOutboxItem> = {}): DraftOutboxItem => ({
  id: 'outbox_1',
  connectionId: 'conn_1',
  threadId: null,
  mission: null,
  status: 'draft_ready',
  gmailDraftId: 'gmail_draft_1',
  to: ['client@example.com'],
  cc: [],
  bcc: [],
  subject: 'Subject',
  body: 'Body',
  sourceAttachments: [],
  classification: 'reply_needed',
  classificationReason: null,
  generationMode: 'server',
  reviewState: 'ready',
  contentRevision: 1,
  contentDigest: 'digest-1',
  idempotencyKey: 'idem_1',
  scheduledSendAt: null,
  error: null,
  createdAt: new Date('2026-07-06T00:00:00.000Z'),
  updatedAt: new Date('2026-07-06T00:00:00.000Z'),
  ...overrides,
});

describe('draft-outbox state machine guards', () => {
  it('rejects double-approve once an item is already approved', () => {
    const approved = baseItem({ status: 'approved', scheduledSendAt: new Date() });

    expect(() => approveDraftOutboxItem(approved)).toThrow(/draft_ready/);
  });

  it('rejects approval while Codex still owns a correction', () => {
    expect(() => approveDraftOutboxItem(baseItem({ reviewState: 'revising' }))).toThrow(
      /reviewState ready/,
    );
  });

  it('rejects approval when the stored body is empty or only the Reta signature', () => {
    expect(() => approveDraftOutboxItem(baseItem({ body: '<p><br></p>' }))).toThrow(
      /non-empty email body/,
    );
    expect(() =>
      approveDraftOutboxItem(
        baseItem({ body: '<p>Sent via <a href="https://devlab.io">Reta by Devlab</a></p>' }),
      ),
    ).toThrow(/non-empty email body/);
  });

  it('allows cancellation during the countdown from approved', () => {
    const approved = baseItem({ status: 'approved', scheduledSendAt: new Date() });

    const cancelled = cancelDraftOutboxItem(approved);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.scheduledSendAt).toBeNull();
  });

  it('allows retry from failed only', () => {
    const failed = baseItem({ status: 'failed', error: 'temporary failure' });

    expect(retryDraftOutboxItem(failed)).toMatchObject({
      status: 'queued',
      error: null,
      gmailDraftId: null,
      scheduledSendAt: null,
    });
    expect(() => retryDraftOutboxItem(baseItem({ status: 'draft_ready' }))).toThrow(/failed/);
  });

  it('prevents idempotent double-send with gmailDraftId plus terminal state guard', () => {
    const sending = beginSendingDraftOutboxItem(
      baseItem({ status: 'approved', gmailDraftId: 'gmail_draft_1' }),
    );
    const sent = markDraftOutboxItemSent(sending);

    expect(sent.status).toBe('sent');
    expect(sent.gmailDraftId).toBe('gmail_draft_1');
    expect(() => beginSendingDraftOutboxItem(sent)).toThrow(/terminal/);
  });

  it('refuses to start delivery if an approved item lost its body', () => {
    expect(() => beginSendingDraftOutboxItem(baseItem({ status: 'approved', body: '' }))).toThrow(
      /non-empty email body/,
    );
  });
});
