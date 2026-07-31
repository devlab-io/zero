import type { ThreadListItem } from '@zero/types';

export type DraftRowPreview = {
  recipient: string;
  subject: string;
  receivedAt: number | null;
};

type DraftListRaw = {
  subject?: unknown;
  receivedOn?: unknown;
  rawMessage?: { internalDate?: unknown };
  to?: unknown;
};

function recipientText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const recipient = value as { name?: unknown; email?: unknown };
  if (typeof recipient.name === 'string' && recipient.name.trim()) return recipient.name;
  return typeof recipient.email === 'string' ? recipient.email : null;
}

function receivedAt(raw: DraftListRaw, fallback?: string): number | null {
  const internalDate = raw.rawMessage?.internalDate;
  if (typeof internalDate === 'string' || typeof internalDate === 'number') {
    const parsed = Number(internalDate);
    if (Number.isFinite(parsed)) return parsed;
  }

  const source = typeof raw.receivedOn === 'string' ? raw.receivedOn : fallback;
  if (!source) return null;
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Draft list already fetched Gmail `drafts.get(full)` for every row. Reuse that
 * `$raw` payload instead of issuing the exact same request again per mounted row.
 */
export function selectDraftRowPreview(message: ThreadListItem): DraftRowPreview | null {
  if (!message.$raw || typeof message.$raw !== 'object') return null;
  const raw = message.$raw as DraftListRaw;
  const recipients = Array.isArray(raw.to) ? raw.to : [];
  return {
    recipient: recipientText(recipients[0]) ?? 'No Recipient',
    subject: typeof raw.subject === 'string' ? raw.subject : (message.subject ?? ''),
    receivedAt: receivedAt(raw, message.receivedOn),
  };
}
