import type { ThreadListItem } from '@zero/types';

export type DraftListRow = {
  id: string;
  recipient: string;
  subject: string;
  preview: string;
  receivedAt: number | null;
};

type DraftRaw = {
  subject?: unknown;
  receivedOn?: unknown;
  rawMessage?: { internalDate?: unknown };
  to?: unknown;
  content?: unknown;
  snippet?: unknown;
  text?: unknown;
};

const recipientText = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const recipient = value as { name?: unknown; email?: unknown };
  if (typeof recipient.name === 'string' && recipient.name.trim()) return recipient.name.trim();
  return typeof recipient.email === 'string' ? recipient.email.trim() : null;
};

const parseReceivedAt = (raw: DraftRaw, fallback?: string): number | null => {
  const internalDate = raw.rawMessage?.internalDate;
  if (typeof internalDate === 'string' || typeof internalDate === 'number') {
    const parsed = Number(internalDate);
    if (Number.isFinite(parsed)) return parsed;
  }
  const source = typeof raw.receivedOn === 'string' ? raw.receivedOn : fallback;
  if (!source) return null;
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : null;
};

export const stripDraftHtml = (value: string): string =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const draftListRow = (item: ThreadListItem): DraftListRow => {
  const raw = item.$raw && typeof item.$raw === 'object' ? (item.$raw as DraftRaw) : {};
  const recipients = Array.isArray(raw.to) ? raw.to : [];
  const rawPreview = [raw.snippet, raw.content, raw.text].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return {
    id: item.id,
    recipient: recipientText(recipients[0]) ?? 'No recipient',
    subject:
      (typeof raw.subject === 'string' && raw.subject.trim()) || item.subject || 'Untitled draft',
    preview: rawPreview ? stripDraftHtml(rawPreview) : '',
    receivedAt: parseReceivedAt(raw, item.receivedOn),
  };
};

export const matchesDraftSearch = (row: DraftListRow, search: string): boolean => {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  return `${row.recipient}\n${row.subject}\n${row.preview}`.toLocaleLowerCase().includes(needle);
};

export const moveDraftSelection = (
  ids: readonly string[],
  currentId: string | null,
  direction: -1 | 1,
): string | null => {
  if (ids.length === 0) return null;
  const index = currentId ? ids.indexOf(currentId) : -1;
  if (index === -1) return direction === 1 ? (ids[0] ?? null) : (ids.at(-1) ?? null);
  return ids[Math.max(0, Math.min(ids.length - 1, index + direction))] ?? currentId;
};
