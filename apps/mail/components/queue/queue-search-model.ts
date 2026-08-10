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
