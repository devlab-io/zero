import { load, type CheerioAPI } from 'cheerio/slim';
import type { Element } from 'domhandler';

export type SanitizedMailContent = {
  text: string;
  removedHiddenSegments: number;
};

const SPOTLIGHT_HEADER = '[UNTRUSTED EMAIL CONTENT - SANITIZED]';
const HIDDEN_CONTENT_MARKER = '[hidden content removed]';

type InlineStyle = Record<string, string>;

const parseInlineStyle = (style: string | undefined): InlineStyle =>
  Object.fromEntries(
    (style ?? '')
      .split(';')
      .map((rule) => {
        const separator = rule.indexOf(':');
        if (separator === -1) return null;

        const property = rule.slice(0, separator).trim().toLowerCase();
        const value = rule
          .slice(separator + 1)
          .replace(/!important/gi, '')
          .trim()
          .toLowerCase();

        return property && value ? [property, value] : null;
      })
      .filter((rule): rule is [string, string] => !!rule),
  );

const getStyles = ($: CheerioAPI, element: Element) => parseInlineStyle($(element).attr('style'));

const hasHiddenAncestor = ($: CheerioAPI, element: Element, hiddenNodes: Element[]) => {
  const parents = $(element).parents().toArray();
  return hiddenNodes.some((hiddenNode) => parents.includes(hiddenNode));
};

const getStyleFromElementOrAncestors = ($: CheerioAPI, element: Element, properties: string[]) => {
  const elements = [element, ...($(element).parents().toArray() as Element[])];

  for (const current of elements) {
    const styles = getStyles($, current);
    for (const property of properties) {
      if (styles[property]) return styles[property];
    }
  }

  return undefined;
};

const isWhite = (value: string | undefined) => {
  if (!value) return false;
  const compact = value.replace(/\s+/g, '').toLowerCase();

  return (
    /\bwhite\b/.test(value) ||
    /(^|[^a-f0-9])#fff($|[^a-f0-9])/.test(compact) ||
    /(^|[^a-f0-9])#ffffff($|[^a-f0-9])/.test(compact) ||
    /rgba?\(255,255,255(?:,(?:1|100%))?\)/.test(compact)
  );
};

const isZeroFontSize = (value: string | undefined) => {
  if (!value) return false;
  return /^0(?:\.0+)?(?:px|pt|em|rem|%)?$/.test(value.replace(/\s+/g, '').toLowerCase());
};

const isHiddenElement = ($: CheerioAPI, element: Element) => {
  const styles = getStyles($, element);
  const color = getStyleFromElementOrAncestors($, element, ['color']);
  const background = getStyleFromElementOrAncestors($, element, ['background-color', 'background']);

  return (
    $(element).attr('hidden') !== undefined ||
    $(element).attr('aria-hidden') === 'true' ||
    styles.display === 'none' ||
    styles.visibility === 'hidden' ||
    styles.visibility === 'collapse' ||
    styles.opacity === '0' ||
    isZeroFontSize(styles['font-size']) ||
    /\b0(?:\.0+)?(?:px|pt|em|rem)\b/.test(styles.font ?? '') ||
    (isWhite(color) && isWhite(background))
  );
};

const normalizePlainText = (text: string) =>
  text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

const addPlainTextBreaks = ($: CheerioAPI) => {
  $('br').replaceWith('\n');
  $('p, div, li, tr, table, blockquote, h1, h2, h3, h4, h5, h6').each((_, element) => {
    $(element).append('\n');
  });
};

export const sanitizeMailContent = (content: string | null | undefined): SanitizedMailContent => {
  const $ = load(content ?? '', null, false);

  $('script, style, template, head, title, meta, link').remove();

  const hiddenNodes: Element[] = [];
  $('*').each((_, element) => {
    const candidate = element as Element;
    if (hasHiddenAncestor($, candidate, hiddenNodes)) return;
    if (isHiddenElement($, candidate)) hiddenNodes.push(candidate);
  });

  let removedHiddenSegments = 0;
  for (const element of hiddenNodes) {
    if (normalizePlainText($(element).text())) removedHiddenSegments += 1;
    $(element).replaceWith(` ${HIDDEN_CONTENT_MARKER} `);
  }

  addPlainTextBreaks($);

  const plainText = normalizePlainText($.root().text());
  const lines = [SPOTLIGHT_HEADER, plainText || '(empty sanitized content)'];

  if (removedHiddenSegments) {
    lines.push(`Sanitizer note: removed ${removedHiddenSegments} hidden segment(s).`);
  }

  return {
    text: lines.join('\n'),
    removedHiddenSegments,
  };
};
