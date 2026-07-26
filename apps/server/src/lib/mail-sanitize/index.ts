import { estimateNestingDepth, MAX_HTML_LENGTH, MAX_HTML_NESTING_DEPTH } from '../html-bounds';
import { load, contains, type Cheerio, type CheerioAPI } from 'cheerio/slim';

// cheerio does not re-export domhandler's node types, and domhandler is a transitive
// (non-hoisted) dependency this package can't import by name. Recover them from cheerio's
// own API so the sanitizer stays fully typed without adding a dependency: `contains`
// exposes AnyNode, and a selection's `.find()` result carries the concrete Element node.
type AnyNode = Parameters<typeof contains>[0];
type Element = ReturnType<Cheerio<AnyNode>['find']> extends Cheerio<infer E> ? E : never;

export type SanitizedMailContent = {
  /** Rendu complet destiné au LLM : en-tête de mise en garde + corps + notes. */
  text: string;
  /**
   * Corps neutralisé SEUL, sans en-tête ni notes. Sert aux appelants qui doivent décider sur
   * le contenu réel (ex. `messageToXML` ignore un message trop court) : mesurer `text`
   * mesurerait l'en-tête, jamais le mail.
   */
  body: string;
  removedHiddenSegments: number;
};

const SPOTLIGHT_HEADER = '[UNTRUSTED EMAIL CONTENT - SANITIZED]';
/** Remplace un segment caché retiré. Exporté : les appelants qui MESURENT le corps doivent
 * pouvoir le retrancher — un message intégralement caché ne doit pas paraître substantiel. */
export const HIDDEN_CONTENT_MARKER = '[hidden content removed]';

// Éléments dont le CONTENU ne doit jamais ressortir. iframe/frame/object/embed ont été
// ajoutés en A5 : leur texte de repli fuitait tel quel, ce qui en faisait un véhicule de
// prompt-injection aussi commode qu'un <script> (constat mesuré par xss-vectors.test.ts).
const DROPPED_ELEMENTS =
  'script, style, template, head, title, meta, link, iframe, frame, frameset, object, embed, applet';

// Bornes d'entrée (A5). Sans elles, un mail hostile profondément imbriqué faisait lever une
// RangeError non catchée jusque dans l'appelant MCP (routes/agent/mcp.ts), c'est-à-dire un
// déni de service sur `getThread` déclenchable par un simple mail entrant. Elles vivent
// maintenant dans lib/html-bounds.ts, partagées avec le chemin de rendu (lib/email-processor).
const MAX_CONTENT_LENGTH = MAX_HTML_LENGTH;
const MAX_NESTING_DEPTH = MAX_HTML_NESTING_DEPTH;
const MAX_STYLE_RULES = 500;
const MAX_STYLE_LENGTH = 200_000;

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

/** Un jeu de déclarations rend-il sa cible invisible, quelle qu'en soit la provenance ? */
const declarationsHide = (styles: InlineStyle) =>
  styles.display === 'none' ||
  styles.visibility === 'hidden' ||
  styles.visibility === 'collapse' ||
  styles.opacity === '0' ||
  isZeroFontSize(styles['font-size']) ||
  /\b0(?:\.0+)?(?:px|pt|em|rem)\b/.test(styles.font ?? '');

/**
 * Sélecteurs des règles CSS qui masquent leur cible, extraits des balises `<style>`.
 * Sans cela, un payload caché par une CLASSE — la forme courante en prompt-injection —
 * traversait le filtre en clair, alors que le même payload caché en style inline était
 * correctement neutralisé (constat A5).
 */
const hidingSelectorsFromStyleSheets = ($: CheerioAPI): string[] => {
  let css = '';
  $('style').each((_, element) => {
    if (css.length < MAX_STYLE_LENGTH) css += `\n${$(element).text()}`;
  });
  if (!css.trim()) return [];

  const selectors: string[] = [];
  // Règles simples `sélecteur { déclarations }`. Les @-rules (media, font-face) sont
  // ignorées : leur corps contient des accolades imbriquées que ce parseur volontairement
  // minimal ne prétend pas comprendre.
  const rulePattern = /([^{}@]+)\{([^{}]*)\}/g;
  const source = css.slice(0, MAX_STYLE_LENGTH);
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(source))) {
    if (selectors.length >= MAX_STYLE_RULES) break;

    const selector = (match[1] ?? '').trim();
    const declarations = parseInlineStyle(match[2]);
    if (!selector || selector.startsWith('@')) continue;

    const hides =
      declarationsHide(declarations) ||
      (isWhite(declarations.color) &&
        isWhite(declarations['background-color'] ?? declarations.background));

    if (hides) selectors.push(selector);
  }

  return selectors;
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

const compose = (
  plainText: string,
  removedHiddenSegments: number,
  notes: string[] = [],
): SanitizedMailContent => {
  const lines = [SPOTLIGHT_HEADER, plainText || '(empty sanitized content)'];
  if (removedHiddenSegments) {
    lines.push(`Sanitizer note: removed ${removedHiddenSegments} hidden segment(s).`);
  }
  lines.push(...notes.map((note) => `Sanitizer note: ${note}`));
  return { text: lines.join('\n'), body: plainText, removedHiddenSegments };
};

/** Repli linéaire, sans DOM, pour les entrées que l'on refuse de parser. */
const degradeToPlainText = (content: string, reason: string): SanitizedMailContent =>
  compose(normalizePlainText(content.replace(/<[^>]*>/g, ' ')), 0, [
    `${reason} — hidden-content detection was skipped for this message.`,
  ]);

/**
 * Rend le contenu d'un mail sous forme de texte destiné à l'agent IA, en retirant ce qui est
 * invisible pour l'humain — véhicule habituel de la prompt-injection.
 *
 * Ne lève JAMAIS : l'appelant MCP (routes/agent/mcp.ts) n'a pas de filet, et un mail entrant
 * ne doit pas pouvoir faire échouer `getThread`.
 */
export const sanitizeMailContent = (content: string | null | undefined): SanitizedMailContent => {
  const raw = content ?? '';

  try {
    if (raw.length > MAX_CONTENT_LENGTH) {
      return degradeToPlainText(
        raw.slice(0, MAX_CONTENT_LENGTH),
        'content exceeded the size limit',
      );
    }
    if (estimateNestingDepth(raw) > MAX_NESTING_DEPTH) {
      return degradeToPlainText(raw, 'content exceeded the nesting-depth limit');
    }

    const $ = load(raw, null, false);

    // Les feuilles de style sont lues AVANT d'être retirées : leurs règles décident de la
    // visibilité des éléments qui les référencent par classe ou par identifiant.
    const cssHidden = new Set<Element>();
    for (const selector of hidingSelectorsFromStyleSheets($)) {
      try {
        $(selector).each((_, element) => {
          cssHidden.add(element as Element);
        });
      } catch {
        // Sélecteur que css-select ne sait pas interpréter : on l'ignore plutôt que de
        // faire échouer toute la sanitisation.
      }
    }

    $(DROPPED_ELEMENTS).remove();

    // Parcours DESCENDANT itératif : l'ancienne version remontait `parents()` pour chaque
    // élément (coût quadratique mesuré à ~1 s pour 2 000 niveaux). Ici la profondeur vit
    // dans le tas, et couleur/fond sont hérités en descendant.
    type Frame = { node: Element; color?: string; background?: string };
    const hiddenRoots: Element[] = [];
    const stack: Frame[] = ($.root().children().toArray() as Element[])
      .reverse()
      .map((node) => ({ node }));

    while (stack.length) {
      const frame = stack.pop() as Frame;
      const node = frame.node;
      const styles = parseInlineStyle($(node).attr('style'));
      const color = styles.color ?? frame.color;
      const background = styles['background-color'] ?? styles.background ?? frame.background;

      const hidden =
        $(node).attr('hidden') !== undefined ||
        $(node).attr('aria-hidden') === 'true' ||
        declarationsHide(styles) ||
        cssHidden.has(node) ||
        (isWhite(color) && isWhite(background));

      if (hidden) {
        // Sous-arbre entier retiré : inutile de descendre plus bas.
        hiddenRoots.push(node);
        continue;
      }

      const children = $(node).children().toArray() as Element[];
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ node: children[i] as Element, color, background });
      }
    }

    let removedHiddenSegments = 0;
    for (const element of hiddenRoots) {
      if (normalizePlainText($(element).text())) removedHiddenSegments += 1;
      $(element).replaceWith(` ${HIDDEN_CONTENT_MARKER} `);
    }

    addPlainTextBreaks($);

    return compose(normalizePlainText($.root().text()), removedHiddenSegments);
  } catch (error) {
    // Dernier filet : quoi qu'il arrive, l'appelant reçoit un contenu exploitable et une
    // note honnête plutôt qu'une exception.
    return degradeToPlainText(
      raw.slice(0, MAX_CONTENT_LENGTH),
      `sanitizer fell back after an internal error (${error instanceof Error ? error.name : 'unknown'})`,
    );
  }
};
