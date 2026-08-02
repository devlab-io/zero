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

/**
 * Envoi direct (Mod+Enter) : autorisé UNIQUEMENT depuis le brouillon COMPLET
 * (drafts.get) — jamais depuis une DraftListRow partielle. Le draft chargé
 * doit correspondre à la ligne sélectionnée et porter au moins un
 * destinataire ; le serveur enverra le brouillon TEL QUE STOCKÉ.
 */
export type DirectSendCheck =
  | { ok: true; to: string[]; cc: string[]; bcc: string[]; subject: string }
  | { ok: false; reason: 'not-loaded' | 'mismatch' | 'no-recipient' };

export type DirectSendCandidate = {
  draftId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
};

export type ConfirmedDirectSend = {
  draftId: string;
  sendAsStored: true;
  to: { email: string; name: string }[];
  cc: { email: string; name: string }[];
  bcc: { email: string; name: string }[];
  subject: string;
  message: '';
  clientSendId: string;
};

/**
 * Stable for the lifetime of a provider draft, including page reloads. The
 * server scopes this key by connection, so the same provider id in another
 * mailbox cannot collide. Keeping the key deterministic closes the window
 * where a double shortcut could enqueue a second job before the provider has
 * removed the sent draft from the list.
 */
export const directSendClientId = (draftId: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < draftId.length; index += 1) {
    hash ^= BigInt(draftId.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `draft-direct-${hash.toString(36)}`;
};

export const canDirectSend = (
  rowId: string | null,
  draft:
    | { id?: unknown; to?: unknown; cc?: unknown; bcc?: unknown; subject?: unknown }
    | null
    | undefined,
): DirectSendCheck => {
  if (!rowId || !draft || typeof draft.id !== 'string') {
    return { ok: false, reason: 'not-loaded' };
  }
  if (draft.id !== rowId) return { ok: false, reason: 'mismatch' };
  const addresses = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry.includes('@'))
      : [];
  const to = addresses(draft.to);
  const cc = addresses(draft.cc);
  const bcc = addresses(draft.bcc);
  if (to.length + cc.length + bcc.length === 0) return { ok: false, reason: 'no-recipient' };
  return {
    ok: true,
    to,
    cc,
    bcc,
    subject: typeof draft.subject === 'string' ? draft.subject : '',
  };
};

/**
 * The mutation payload only exists after an explicit confirmation candidate
 * has been created. Revalidate the complete draft at confirmation time and
 * reject a stale dialog if recipients or subject changed underneath it.
 */
export const buildConfirmedDirectSend = (
  candidate: DirectSendCandidate | null,
  draft:
    | { id?: unknown; to?: unknown; cc?: unknown; bcc?: unknown; subject?: unknown }
    | null
    | undefined,
): ConfirmedDirectSend | null => {
  if (!candidate) return null;
  const check = canDirectSend(candidate.draftId, draft);
  if (!check.ok) return null;
  if (
    check.subject !== candidate.subject ||
    check.to.join('\n') !== candidate.to.join('\n') ||
    check.cc.join('\n') !== candidate.cc.join('\n') ||
    check.bcc.join('\n') !== candidate.bcc.join('\n')
  ) {
    return null;
  }
  return {
    draftId: candidate.draftId,
    sendAsStored: true,
    to: check.to.map((email) => ({ email, name: email.split('@')[0] || email })),
    cc: check.cc.map((email) => ({ email, name: email.split('@')[0] || email })),
    bcc: check.bcc.map((email) => ({ email, name: email.split('@')[0] || email })),
    subject: check.subject,
    message: '',
    clientSendId: directSendClientId(candidate.draftId),
  };
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

export const toggleDraftSelection = (
  selectedIds: ReadonlySet<string>,
  draftId: string,
): Set<string> => {
  const next = new Set(selectedIds);
  if (next.has(draftId)) next.delete(draftId);
  else next.add(draftId);
  return next;
};

export const selectDraftRange = (
  orderedIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  anchorId: string | null,
  targetId: string,
): Set<string> => {
  const anchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1;
  const targetIndex = orderedIds.indexOf(targetId);
  if (targetIndex === -1) return new Set(selectedIds);
  if (anchorIndex === -1) return toggleDraftSelection(selectedIds, targetId);

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const next = new Set(selectedIds);
  orderedIds.slice(start, end + 1).forEach((id) => next.add(id));
  return next;
};

export const nextDraftAfterDeletion = (
  orderedIds: readonly string[],
  currentId: string | null,
  deletedIds: ReadonlySet<string>,
): string | null => {
  const remaining = orderedIds.filter((id) => !deletedIds.has(id));
  if (!remaining.length) return null;
  if (!currentId || !deletedIds.has(currentId)) {
    return currentId && remaining.includes(currentId) ? currentId : (remaining[0] ?? null);
  }

  const currentIndex = orderedIds.indexOf(currentId);
  const next = orderedIds.slice(currentIndex + 1).find((id) => !deletedIds.has(id));
  if (next) return next;
  return (
    orderedIds
      .slice(0, currentIndex)
      .reverse()
      .find((id) => !deletedIds.has(id)) ?? null
  );
};
