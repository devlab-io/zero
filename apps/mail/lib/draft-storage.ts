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
const OWNED_KEY_VERSION = 'v2';

/** The account partition every composer seam MUST carry (scope-fix 2026-08-01). */
export type DraftOwner = { userId: string; connectionId: string };

/**
 * LEGACY unscoped key (v1) — kept ONLY as documentation of the old format.
 * SAFE BREAK: these keys never contained the account, so the bare `compose`
 * slot collided across users/connections on a shared device. The app no
 * longer READS or WRITES them anywhere (composer autosave/restore, live
 * registry, insert seam, Ask Reta); existing v1 entries are left INTACT in
 * localStorage for manual recovery — never migrated (ambiguous owner) and
 * never deleted.
 */
export function draftStorageKey(scope: ComposerDraftScope): string {
  const parts = [
    scope.draftId ? `d=${scope.draftId}` : '',
    scope.threadId ? `t=${scope.threadId}` : '',
    scope.replyId ? `r=${scope.replyId}` : '',
  ].filter(Boolean);
  return `${KEY_PREFIX}${parts.length ? parts.join('&') : 'compose'}`;
}

/**
 * OWNED key (v2): partitioned by {userId, connectionId} — the owner is
 * MANDATORY, never optional (an optional owner would fail open onto a shared
 * key). Same-scope drafts of two accounts are structurally distinct entries.
 */
export function ownedDraftStorageKey(owner: DraftOwner, scope: ComposerDraftScope): string {
  if (!owner.userId || !owner.connectionId) {
    throw new Error('ownedDraftStorageKey requires a fully resolved owner');
  }
  const parts = [
    scope.draftId ? `d=${scope.draftId}` : '',
    scope.threadId ? `t=${scope.threadId}` : '',
    scope.replyId ? `r=${scope.replyId}` : '',
  ].filter(Boolean);
  return `${KEY_PREFIX}${OWNED_KEY_VERSION}:u=${owner.userId}:c=${owner.connectionId}:${parts.length ? parts.join('&') : 'compose'}`;
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
