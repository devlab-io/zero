export const ASK_RETA_ATTACHMENT_LIMITS = {
  files: 5,
  bytesPerFile: 2 * 1024 * 1024,
  textCharsPerFile: 16_000,
  totalTextChars: 48_000,
} as const;

export type AskRetaAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  text: string;
};

export type AskRetaAttachmentRejection = {
  name: string;
  reason: 'limit' | 'size' | 'type' | 'empty';
};

const TEXT_EXTENSIONS = new Set([
  'csv',
  'html',
  'json',
  'log',
  'md',
  'markdown',
  'rtf',
  'text',
  'tsv',
  'txt',
  'xml',
  'yaml',
  'yml',
]);

const extensionOf = (name: string) => name.toLocaleLowerCase().split('.').pop() ?? '';

export function isAskRetaTextAttachment(file: Pick<File, 'name' | 'type'>): boolean {
  return (
    file.type.startsWith('text/') ||
    ['application/json', 'application/rtf', 'application/xml'].includes(file.type) ||
    TEXT_EXTENSIONS.has(extensionOf(file.name))
  );
}

const normalizeText = (value: string) =>
  value.split('\u0000').join('').replace(/\r\n?/g, '\n').trim();

/**
 * Extracts only bounded text formats in the browser. PDF/image/Office files
 * are rejected explicitly instead of pretending their binary bytes are text.
 */
export async function extractAskRetaAttachments(
  files: Iterable<File>,
  existing: readonly AskRetaAttachment[] = [],
): Promise<{ accepted: AskRetaAttachment[]; rejected: AskRetaAttachmentRejection[] }> {
  const accepted: AskRetaAttachment[] = [];
  const rejected: AskRetaAttachmentRejection[] = [];
  let remainingChars = Math.max(
    0,
    ASK_RETA_ATTACHMENT_LIMITS.totalTextChars -
      existing.reduce((total, attachment) => total + attachment.text.length, 0),
  );

  for (const file of files) {
    if (existing.length + accepted.length >= ASK_RETA_ATTACHMENT_LIMITS.files) {
      rejected.push({ name: file.name, reason: 'limit' });
      continue;
    }
    if (file.size > ASK_RETA_ATTACHMENT_LIMITS.bytesPerFile) {
      rejected.push({ name: file.name, reason: 'size' });
      continue;
    }
    if (!isAskRetaTextAttachment(file)) {
      rejected.push({ name: file.name, reason: 'type' });
      continue;
    }
    const text = normalizeText(await file.text()).slice(
      0,
      Math.min(ASK_RETA_ATTACHMENT_LIMITS.textCharsPerFile, remainingChars),
    );
    if (!text) {
      rejected.push({ name: file.name, reason: 'empty' });
      continue;
    }
    accepted.push({
      id: crypto.randomUUID(),
      name: file.name.slice(0, 200),
      type: (file.type || 'text/plain').slice(0, 100),
      size: file.size,
      text,
    });
    remainingChars -= text.length;
    if (remainingChars <= 0) break;
  }

  return { accepted, rejected };
}
