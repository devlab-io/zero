/**
 * Local, durable composer-draft persistence (issue #34, check point 5).
 *
 * A draft must survive component unmount, pagehide/reload, AND a failed server
 * autosave. localStorage gives durability that is independent of the network, so
 * a snapshot written here outlives any failed `drafts.create` request. Every
 * operation is best-effort and NEVER throws (private mode / quota are tolerated).
 */

export interface StoredComposerDraft {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  message: string;
  savedAt: number;
}

export interface ComposerDraftScope {
  threadId?: string | null;
  draftId?: string | null;
  replyId?: string | null;
}

const KEY_PREFIX = 'zero:composer-draft:';

/** Stable, scope-derived key so each composer instance owns exactly one snapshot slot. */
export function draftStorageKey(scope: ComposerDraftScope): string {
  const parts = [
    scope.draftId ? `d=${scope.draftId}` : '',
    scope.threadId ? `t=${scope.threadId}` : '',
    scope.replyId ? `r=${scope.replyId}` : '',
  ].filter(Boolean);
  return `${KEY_PREFIX}${parts.length ? parts.join('&') : 'compose'}`;
}

function getStore(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredDraft(value: unknown): value is StoredComposerDraft {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.to) &&
    Array.isArray(v.cc) &&
    Array.isArray(v.bcc) &&
    typeof v.subject === 'string' &&
    typeof v.message === 'string' &&
    typeof v.savedAt === 'number'
  );
}

/** True when the snapshot holds something worth restoring (avoids resurrecting blank drafts). */
export function draftHasContent(draft: StoredComposerDraft): boolean {
  const text = draft.message.replace(/<[^>]*>/g, '').trim();
  return text.length > 0 || draft.subject.trim().length > 0 || draft.to.length > 0;
}

export function saveLocalDraft(key: string, draft: StoredComposerDraft): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadLocalDraft(key: string): StoredComposerDraft | null {
  const store = getStore();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(key: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* best-effort */
  }
}
