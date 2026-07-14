import type { IGetThreadResponse, ParsedMessage } from '@zero/types';
import type { MailListItem } from '@/hooks/use-mail-list-data';

/**
 * #30 — pure view-model + memo comparator for the thread row, split out of
 * `mail-list-thread.tsx` so it is unit-testable without dragging the component's `@/…`
 * runtime import graph (the mail vitest env resolves type imports only). Every import here
 * is type-only.
 */

/**
 * Synthesize the thread-row view model from the rich list projection (subject / sender /
 * date / labels / unread) WITHOUT fetching the body. Labels double as `tags` so
 * STARRED / IMPORTANT detection keeps working; `body` stays empty (snippet removed by ruling).
 */
export function buildProjectedThreadData(message: MailListItem): IGetThreadResponse {
  const labels = message.labels ?? [];
  const latest: ParsedMessage = {
    id: message.id,
    threadId: message.id,
    title: message.subject ?? '',
    subject: message.subject ?? '',
    tags: labels.map((label) => ({ id: label.id, name: label.name, type: 'label' })),
    sender: message.sender ?? { email: '' },
    to: [],
    cc: null,
    bcc: null,
    tls: false,
    receivedOn: message.receivedOn ?? '',
    unread: message.unread ?? false,
    body: '',
    processedHtml: '',
    blobUrl: '',
  };
  return {
    messages: [latest],
    latest,
    hasUnread: message.unread ?? false,
    totalReplies: 0,
    labels,
  };
}

export type ThreadRowProps = {
  message: MailListItem;
  onClick?: (message: ParsedMessage) => () => void;
  isKeyboardFocused?: boolean;
  index?: number;
};

/** Content+order equality of the projected labels (drives starred/important + label chips). */
function sameProjectedLabels(a: MailListItem['labels'], b: MailListItem['labels']): boolean {
  const al = a ?? [];
  const bl = b ?? [];
  if (al.length !== bl.length) return false;
  for (let i = 0; i < al.length; i++) {
    if (al[i].id !== bl[i].id || al[i].name !== bl[i].name) return false;
  }
  return true;
}

/**
 * React.memo comparator (#30). Because the row now renders from the projection carried on
 * `message`, the memo MUST compare every rendered projection field — otherwise a server
 * refetch that swaps a label of equal length (STARRED→IMPORTANT) or changes the sender name
 * at an unchanged email would leave the row visually stale.
 */
export function threadRowPropsAreEqual(prev: ThreadRowProps, next: ThreadRowProps): boolean {
  const p = prev.message;
  const n = next.message;
  return (
    p.id === n.id &&
    prev.isKeyboardFocused === next.isKeyboardFocused &&
    prev.index === next.index &&
    Object.is(prev.onClick, next.onClick) &&
    p.subject === n.subject &&
    p.receivedOn === n.receivedOn &&
    p.unread === n.unread &&
    (p.sender?.email ?? '') === (n.sender?.email ?? '') &&
    (p.sender?.name ?? '') === (n.sender?.name ?? '') &&
    sameProjectedLabels(p.labels, n.labels)
  );
}
