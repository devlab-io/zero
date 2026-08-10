const SIMPLE_MESSAGE_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'div',
  'em',
  'i',
  'li',
  'ol',
  'p',
  'span',
  'strong',
  'u',
  'ul',
]);

/**
 * Plain transactional messages should read like messages in a conversation,
 * not like miniature web pages. Rich newsletters keep the hardened MailContent
 * renderer; only small, style-free markup is rendered natively in the queue.
 */
export const isSimpleQueueMessageHtml = (html: string) => {
  if (!html.trim() || html.length > 20_000) return false;
  if (/\b(?:style|class|bgcolor|background|srcset)\s*=/i.test(html)) return false;

  const tags = html.matchAll(/<\/?\s*([a-z][\w-]*)\b[^>]*>/gi);
  for (const match of tags) {
    if (!SIMPLE_MESSAGE_TAGS.has((match[1] ?? '').toLowerCase())) return false;
  }
  return true;
};

const decodeCodePoint = (value: string, radix: number) => {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return '�';
  return String.fromCodePoint(codePoint);
};

const decodeHtmlEntities = (value: string) =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code: string) => {
    const normalized = code.toLowerCase();
    if (normalized.startsWith('#x')) return decodeCodePoint(normalized.slice(2), 16);
    if (normalized.startsWith('#')) return decodeCodePoint(normalized.slice(1), 10);
    return (
      {
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        nbsp: ' ',
        quot: '"',
      }[normalized] ?? entity
    );
  });

export const queueMessageText = (html: string) =>
  decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<\/(?:blockquote|div|li|ol|p|ul)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
