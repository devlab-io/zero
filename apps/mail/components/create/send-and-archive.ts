// send-and-archive — pure resolution of the "done" step of `mod+shift+Enter`
// (Shortwave "send and archive/done", issue #32).
//
// The composer sends via its normal path; this decides what to archive afterwards.
// Kept pure and separate from email-composer.tsx so the send-and-archive behaviour is
// unit-testable without mounting the composer/editor/mutation graph.

export interface ArchiveAfterSendTarget {
  threadIds: string[];
  currentFolder: string;
  destination: 'archive';
}

/**
 * The thread to archive after a send-and-archive.
 *
 * Returns `null` for a brand-new compose (no open thread → nothing to archive), so
 * `mod+shift+Enter` in a fresh composer sends without touching any thread. For a reply
 * it archives the open thread; the folder defaults to `inbox` when the route has none.
 */
export function computeArchiveAfterSend(args: {
  threadId: string | null | undefined;
  folder: string | null | undefined;
}): ArchiveAfterSendTarget | null {
  const threadId = args.threadId?.trim();
  if (!threadId) return null;
  return { threadIds: [threadId], currentFolder: args.folder || 'inbox', destination: 'archive' };
}
