const stripHtml = (value: string) =>
  value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>|<\/div\s*>|<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

const decodeCommonEntities = (value: string) =>
  value
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");

/**
 * Texte réellement écrit par l'expéditeur. Les éléments ajoutés par Reta et
 * les marqueurs de citation générés par le composeur ne rendent jamais un
 * corps vide « envoyable ».
 */
export const meaningfulEmailText = (body?: string | null) => {
  if (!body) return '';

  return decodeCommonEntities(stripHtml(body))
    .replace(/(?:sent\s+via\s+)?reta\s+by\s+devlab/gi, ' ')
    .replace(/\bOn\s+[^\n]{0,500}\s+wrote\s*:/gi, ' ')
    .replace(/-+\s*Forwarded message\s*-+\s*From\s*:[\s\S]{0,1000}?To\s*:[^\n]*/gi, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const hasMeaningfulEmailBody = (body?: string | null) =>
  meaningfulEmailText(body).length > 0;

export const hasRetaBranding = (body?: string | null) =>
  body ? /reta\s+by\s+devlab/i.test(decodeCommonEntities(stripHtml(body))) : false;

export class UnsafeEmailContentError extends Error {
  constructor(message = 'Email body is empty or contains only the Reta signature') {
    super(message);
    this.name = 'UnsafeEmailContentError';
  }
}

export const assertMeaningfulEmailBody = (body?: string | null) => {
  if (!hasMeaningfulEmailBody(body)) throw new UnsafeEmailContentError();
};

export const assertSendableEmail = (input: {
  body?: string | null;
  recipients?: ReadonlyArray<unknown> | null;
}) => {
  if (!input.recipients?.length) {
    throw new UnsafeEmailContentError('Email has no recipient');
  }
  assertMeaningfulEmailBody(input.body);
  if (hasRetaBranding(input.body)) {
    throw new UnsafeEmailContentError(
      'Reta signature is no longer allowed. Reload the app and try again.',
    );
  }
};
