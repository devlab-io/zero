/**
 * Live composer insertion seam (Ask Reta, spec docs/spec/mail-copilot.md).
 *
 * A mounted composer registers an insert handler under its EXACT draft-storage
 * scope key (lib/draft-storage.ts). A caller (the Ask Reta panel) targets that
 * key: 'inserted' on success, 'occupied' when the composer already holds
 * content and force was not set — the caller must then ask the user before
 * forcing — and 'no-composer' when nothing live listens (caller falls back to
 * a persisted snapshot + opening the composer). Never overwrites silently.
 */

export type ComposerInsertPayload = {
  subject?: string;
  to?: string;
  /** Sanitized HTML body (normalizeEmailRewriteHtml on the server). */
  message: string;
};

export type ComposerInsertOutcome = 'inserted' | 'occupied';
export type ComposerInsertResult = ComposerInsertOutcome | 'no-composer';

type ComposerInsertHandler = (
  payload: ComposerInsertPayload,
  options: { force: boolean },
) => ComposerInsertOutcome;

const handlers = new Map<string, ComposerInsertHandler>();

/** Returns the unregister function; a remount with the same key replaces the handler. */
export function registerComposerInsertHandler(
  scopeKey: string,
  handler: ComposerInsertHandler,
): () => void {
  handlers.set(scopeKey, handler);
  return () => {
    if (handlers.get(scopeKey) === handler) handlers.delete(scopeKey);
  };
}

export function insertIntoComposer(
  scopeKey: string,
  payload: ComposerInsertPayload,
  options: { force: boolean } = { force: false },
): ComposerInsertResult {
  const handler = handlers.get(scopeKey);
  if (!handler) return 'no-composer';
  return handler(payload, options);
}
