import type { ThreadListItem } from '@zero/types';

export type QueueSearchableItem = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  mission?: string | null;
  classificationReason?: string | null;
  sourceAttachments: Array<{ filename: string }>;
};

export type MailboxSearchRow = {
  id: string;
  sender: string;
  subject: string;
  receivedAt: string | null;
};

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();

export const matchesQueueSearch = (item: QueueSearchableItem, query: string): boolean => {
  const needle = normalizeSearchText(query);
  if (!needle) return true;

  const haystack = normalizeSearchText(
    [
      ...item.to,
      ...item.cc,
      ...item.bcc,
      item.subject,
      item.body,
      item.mission ?? '',
      item.classificationReason ?? '',
      ...item.sourceAttachments.map((attachment) => attachment.filename),
    ].join('\n'),
  );

  return haystack.includes(needle);
};

export const mailboxSearchRow = (item: ThreadListItem): MailboxSearchRow => ({
  id: item.id,
  sender: item.sender?.name?.trim() || item.sender?.email?.trim() || '',
  subject: item.subject?.trim() || '',
  receivedAt: item.receivedOn ?? null,
});
