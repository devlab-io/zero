import {
  canRetrySendJobItem,
  formatSendJobRecipients,
  sortSendJobsForDisplay,
  type SendJobListItem,
} from './send-jobs-view-model';
import { describe, expect, it } from 'vitest';

const item = (over: Partial<SendJobListItem> & { id: string }): SendJobListItem => ({
  status: 'queued',
  error: null,
  subject: 'S',
  to: ['a@x.co'],
  sendAt: null,
  createdAt: 1_000,
  ...over,
});

describe('sortSendJobsForDisplay', () => {
  it('échecs d’abord, puis sending, puis queued ; récents en premier à statut égal', () => {
    const sorted = sortSendJobsForDisplay([
      item({ id: 'q-old', status: 'queued', createdAt: 1 }),
      item({ id: 'f-old', status: 'failed', createdAt: 1 }),
      item({ id: 's1', status: 'sending', createdAt: 5 }),
      item({ id: 'f-new', status: 'failed', createdAt: 9 }),
      item({ id: 'q-new', status: 'queued', createdAt: 9 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['f-new', 'f-old', 's1', 'q-new', 'q-old']);
  });

  it('écarte sent et cancelled : la section montre le vécu, pas l’historique', () => {
    const sorted = sortSendJobsForDisplay([
      item({ id: 'ok', status: 'sent' }),
      item({ id: 'cancelled', status: 'cancelled' }),
      item({ id: 'pending', status: 'queued' }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['pending']);
  });
});

describe('formatSendJobRecipients', () => {
  it('joint les destinataires et compte le surplus au-delà de la borne', () => {
    expect(formatSendJobRecipients(['a@x.co'])).toBe('a@x.co');
    expect(formatSendJobRecipients(['a@x.co', 'b@y.co', 'c@z.co', 'd@w.co'])).toBe(
      'a@x.co, b@y.co, c@z.co +1',
    );
    expect(formatSendJobRecipients([])).toBe('');
  });
});

describe('canRetrySendJobItem', () => {
  it('seul failed est rejouable', () => {
    expect(canRetrySendJobItem('failed')).toBe(true);
    expect(canRetrySendJobItem('queued')).toBe(false);
    expect(canRetrySendJobItem('sending')).toBe(false);
    expect(canRetrySendJobItem('sent')).toBe(false);
    expect(canRetrySendJobItem('cancelled')).toBe(false);
  });
});
