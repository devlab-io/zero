import { RETA_TRIAGE_MAILBOX, classifyTriageThread, triageSearchQuery } from './triage';
import type { IGetThreadResponse } from '../driver/types';
import { describe, expect, it } from 'vitest';

const message = (overrides: Partial<IGetThreadResponse['messages'][number]> = {}) => ({
  id: 'message-1',
  title: 'Extrait',
  subject: 'Projet',
  tags: [],
  sender: { name: 'Client', email: 'client@example.com' },
  to: [{ email: RETA_TRIAGE_MAILBOX }],
  cc: null,
  bcc: null,
  tls: true,
  receivedOn: '2026-08-10T08:00:00.000Z',
  unread: true,
  body: '',
  processedHtml: '',
  blobUrl: '',
  decodedBody: 'Bonjour, pouvez-vous me confirmer la suite ?',
  attachments: [],
  ...overrides,
});

const thread = (messages: IGetThreadResponse['messages'], labels: string[] = ['INBOX']) => ({
  messages,
  latest: messages.findLast((entry) => !entry.isDraft),
  hasUnread: true,
  totalReplies: messages.length,
  labels: labels.map((id) => ({ id, name: id })),
});

describe('RETA mail triage', () => {
  it('retient un dernier message entrant et prépare les destinataires de réponse', () => {
    const candidate = classifyTriageThread({
      threadId: 'thread-1',
      mailboxEmail: RETA_TRIAGE_MAILBOX,
      thread: thread([
        message({
          to: [{ email: RETA_TRIAGE_MAILBOX }, { name: 'Vaiarii', email: 'vaiarii@devlab.io' }],
          cc: [{ email: RETA_TRIAGE_MAILBOX }, { name: 'Omar', email: 'omar@devlab.io' }],
          attachments: [
            {
              attachmentId: 'att-1',
              filename: 'devis.pdf',
              mimeType: 'application/pdf',
              size: 1200,
              body: '',
              headers: [],
            },
          ],
        }),
      ]),
    });
    expect(candidate).toMatchObject({
      classification: 'reply_needed',
      to: ['client@example.com'],
      cc: ['vaiarii@devlab.io', 'omar@devlab.io'],
      subject: 'Re: Projet',
      sourceAttachments: [{ filename: 'devis.pdf', mimeType: 'application/pdf', size: 1200 }],
    });
  });

  it('écarte un fil déjà répondu par Thomas', () => {
    const candidate = classifyTriageThread({
      threadId: 'thread-1',
      mailboxEmail: RETA_TRIAGE_MAILBOX,
      thread: thread([
        message(),
        message({ id: 'message-2', sender: { email: RETA_TRIAGE_MAILBOX }, unread: false }),
      ]),
    });
    expect(candidate).toBeNull();
  });

  it('garde les newsletters visibles dans pas de réponse nécessaire', () => {
    const candidate = classifyTriageThread({
      threadId: 'thread-newsletter',
      mailboxEmail: RETA_TRIAGE_MAILBOX,
      thread: thread([message({ listUnsubscribe: '<https://example.com/unsubscribe>' })]),
    });
    expect(candidate?.classification).toBe('no_reply_needed');
    expect(candidate?.classificationReason).toMatch(/newsletter/i);
  });

  it('garde les réponses automatiques visibles sans demander de réponse', () => {
    const candidate = classifyTriageThread({
      threadId: 'thread-auto-reply',
      mailboxEmail: RETA_TRIAGE_MAILBOX,
      thread: thread([message({ subject: 'Réponse automatique : absence du bureau' })]),
    });
    expect(candidate?.classification).toBe('no_reply_needed');
    expect(candidate?.classificationReason).toMatch(/automatique/i);
  });

  it('écarte spam, corbeille et brouillons', () => {
    for (const labels of [['SPAM'], ['TRASH'], ['DRAFT']]) {
      expect(
        classifyTriageThread({
          threadId: 'thread-excluded',
          mailboxEmail: RETA_TRIAGE_MAILBOX,
          thread: thread([message()], labels),
        }),
      ).toBeNull();
    }
    expect(triageSearchQuery(30)).toContain('newer_than:30d');
  });
});
