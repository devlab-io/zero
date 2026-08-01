export interface QuotedMessageSelection {
  messageId: string;
  text: string;
  authorName?: string;
  authorEmail: string;
}

export interface ThreadQuoteRequest extends QuotedMessageSelection {
  id: string;
}

export type InternalCommentQuote = Pick<ThreadQuoteRequest, 'id' | 'messageId' | 'text'>;

export interface QuoteSelectionToolbar {
  left: number;
  text: string;
  top: number;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function normalizeQuotedSelection(text: string, maxLength = 8_000): string {
  return text
    .replaceAll('\u00a0', ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

export function syncInternalCommentQuote(
  current: InternalCommentQuote | null,
  request?: ThreadQuoteRequest | null,
): InternalCommentQuote | null {
  if (request) {
    return { id: request.id, messageId: request.messageId, text: request.text };
  }
  return current?.id ? null : current;
}

export function buildQuotedReplyHtml(quote: QuotedMessageSelection): string {
  const author = quote.authorName?.trim() || quote.authorEmail;
  const paragraphs = normalizeQuotedSelection(quote.text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('');

  return [
    '<blockquote>',
    `<p><strong>${escapeHtml(author)}</strong> wrote:</p>`,
    paragraphs,
    '</blockquote>',
    '<p></p>',
  ].join('');
}

type QuoteInsertChain = {
  focus: () => QuoteInsertChain;
  insertContent: (content: string) => QuoteInsertChain;
  run: () => boolean;
};

export function insertQuotedReply(
  editor: { chain: () => QuoteInsertChain },
  quote: QuotedMessageSelection,
): boolean {
  return editor.chain().focus().insertContent(buildQuotedReplyHtml(quote)).run();
}

export function resolveQuoteSelectionToolbar({
  root,
  selection,
  viewportWidth,
}: {
  root: ShadowRoot;
  selection: Selection | null;
  viewportWidth: number;
}): QuoteSelectionToolbar | null {
  if (!selection?.rangeCount || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const text = normalizeQuotedSelection(selection.toString());
  const rect = range.getBoundingClientRect();
  if (!text || (!rect.width && !rect.height)) return null;

  return {
    text,
    left: Math.min(viewportWidth - 12, Math.max(12, rect.left + rect.width / 2)),
    top: rect.top > 56 ? rect.top - 44 : rect.bottom + 8,
  };
}
