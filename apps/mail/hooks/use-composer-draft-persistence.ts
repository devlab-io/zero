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

  const latestRef = useRef<StoredComposerDraft | null>(null);

  const update = useCallback(
    (snapshot: StoredComposerDraft) => {
      if (!key) return; // fail-closed
      latestRef.current = snapshot;
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
      const snapshot = latestRef.current;
      if (snapshot && draftHasContent(snapshot)) saveLocalDraft(key, snapshot);
    };
    const unregister = registerComposerFlush(window, document, flush);
    return () => {
      unregister();
      flush(); // durability on unmount (teardown / route change)
    };
  }, [key]);

  return { restored, update, clear };
}
