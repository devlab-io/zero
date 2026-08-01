import {
  clearLocalDraft,
  draftHasContent,
  loadLocalDraft,
  ownedDraftStorageKey,
  saveLocalDraft,
  type ComposerDraftScope,
  type DraftOwner,
  type StoredComposerDraft,
} from '@/lib/draft-storage';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { registerComposerFlush } from '@/lib/composer-flush';

const MAX_RESTORE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ComposerDraftPersistence {
  /** A meaningful, non-stale snapshot to seed the composer on mount, if any. */
  restored: StoredComposerDraft | null;
  /** Record the latest composer state (durable + flushed on pagehide/unmount). */
  update: (snapshot: StoredComposerDraft) => void;
  /** Drop the local snapshot (on successful send or explicit discard). */
  clear: () => void;
}

/**
 * Durable composer persistence (issue #34, check point 5). Writes a localStorage
 * snapshot on every change and flushes the latest on pagehide / visibility-hidden /
 * unmount, so a draft survives unmount, reload and a failed server autosave.
 *
 * OWNER-PARTITIONED (scope-fix 2026-08-01): the key carries {userId,
 * connectionId} — two accounts on one device can never share a slot (the old
 * bare `compose` key collided). While the owner is NOT resolved the hook is
 * FAIL-CLOSED: nothing is read, written or cleared — never a legacy unscoped
 * fallback (v1 keys stay untouched for manual recovery).
 *
 * OWNER-TRANSITION SAFE (owner-transition fix 2026-08-01): the pending
 * snapshot is TAGGED with the key it was recorded under. A flush registered
 * for key B refuses a snapshot recorded under key A, and a stale callback
 * captured under A can only ever write under A — content of one account is
 * structurally unable to land under another account's key, even if the owner
 * changes on the SAME mount (the parent remount via ComposerOwnerGate is the
 * first barrier; this guard holds without it).
 */
export function useComposerDraftPersistence(
  owner: DraftOwner | null,
  scope: ComposerDraftScope,
): ComposerDraftPersistence {
  const key = useMemo(
    () => (owner ? ownedDraftStorageKey(owner, scope) : null),
    // scope is a fresh object each render; key depends only on its identifiers.
    [owner?.userId, owner?.connectionId, scope.threadId, scope.draftId, scope.replyId],
  );

  const restored = useMemo(() => {
    if (!key) return null; // owner unresolved: no shared-key read, ever
    const draft = loadLocalDraft(key);
    if (!draft || !draftHasContent(draft)) return null;
    if (Date.now() - draft.savedAt > MAX_RESTORE_AGE_MS) {
      clearLocalDraft(key);
      return null;
    }
    return draft;
  }, [key]);

  const latestRef = useRef<{ key: string; snapshot: StoredComposerDraft } | null>(null);

  const update = useCallback(
    (snapshot: StoredComposerDraft) => {
      if (!key) return; // fail-closed
      latestRef.current = { key, snapshot };
      if (draftHasContent(snapshot)) saveLocalDraft(key, snapshot);
    },
    [key],
  );

  const clear = useCallback(() => {
    latestRef.current = null;
    if (key) clearLocalDraft(key);
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const flush = () => {
      const latest = latestRef.current;
      // Generation guard: a snapshot recorded under ANOTHER key is stale here
      // (owner/scope changed since) — writing it would leak one account's
      // content into another's slot. The old key's own cleanup flush already
      // persisted it where it belongs.
      if (!latest || latest.key !== key) return;
      if (draftHasContent(latest.snapshot)) saveLocalDraft(key, latest.snapshot);
    };
    const unregister = registerComposerFlush(window, document, flush);
    return () => {
      unregister();
      flush(); // durability on unmount (teardown / route change / owner remount)
    };
  }, [key]);

  return { restored, update, clear };
}
