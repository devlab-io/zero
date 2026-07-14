import {
  clearLocalDraft,
  draftHasContent,
  draftStorageKey,
  loadLocalDraft,
  saveLocalDraft,
  type ComposerDraftScope,
  type StoredComposerDraft,
} from '@/lib/draft-storage';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { registerComposerFlush } from '@/lib/composer-flush';

const MAX_RESTORE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ComposerDraftPersistence {
  /** A meaningful, non-stale snapshot to seed the composer on mount, if any. */
  restored: StoredComposerDraft | null;
  /** Record the latest composer state (durable + flushed on pagehide/unmount). */
  update: (snapshot: StoredComposerDraft) => boolean;
  /** Drop the local snapshot (on successful send or explicit discard). */
  clear: () => void;
}

/**
 * Durable composer persistence (issue #34, check point 5). Writes a localStorage
 * snapshot on every change and flushes the latest on pagehide / visibility-hidden /
 * unmount, so a draft survives unmount, reload and a failed server autosave.
 */
export function useComposerDraftPersistence(scope: ComposerDraftScope): ComposerDraftPersistence {
  const key = useMemo(
    () => draftStorageKey(scope),
    // scope is a fresh object each render; key depends only on its identifiers.
    [scope.threadId, scope.draftId, scope.replyId],
  );

  const restored = useMemo(() => {
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
      latestRef.current = snapshot;
      return draftHasContent(snapshot) ? saveLocalDraft(key, snapshot) : false;
    },
    [key],
  );

  const clear = useCallback(() => {
    latestRef.current = null;
    clearLocalDraft(key);
  }, [key]);

  useEffect(() => {
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
