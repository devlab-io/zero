import { load, contains, type Cheerio, type CheerioAPI } from 'cheerio/slim';
import { checkHtmlBounds, MAX_HTML_LENGTH } from '../html-bounds';

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

/**
 * Caractères qui ne se voient pas mais que le modèle lit : contrôles C0/C1, séparateurs de
 * ligne Unicode (U+2028/2029 — de vraies fins de ligne pour beaucoup de rendus), largeur nulle
 * et surcharges bidirectionnelles (U+202E renverse l'affichage). Un sujet peut en porter :
 * l'humain voit un libellé anodin, le modèle lit autre chose.
 */
const isInvisibleCode = (code: number) =>
  code < 0x20 ||
  (code >= 0x7f && code <= 0x9f) ||
  (code >= 0x200b && code <= 0x200f) ||
  code === 0x2028 ||
  code === 0x2029 ||
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069) ||
  code === 0xfeff;

/** Aplatit sur une seule ligne : tabulation et fins de ligne deviennent une espace,
 * l’invisible disparaît. Un balayage par point de code, sans classe de contrôles en regex. */
const flattenField = (value: string): string => {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) out += ' ';
    else if (!isInvisibleCode(code)) out += char;
  }
  return out;
};

/** Au-delà, un sujet ou un nom d'expéditeur n'est plus un libellé : c'est une charge utile. */
const MAX_FIELD_LENGTH = 500;

/**
 * Neutralise un champ COURT contrôlé par l'expéditeur — sujet, nom d'expéditeur — avant de
 * l'injecter dans un prompt.
 *
 * La sanitisation ne couvrait que le CORPS. Sujet et nom d'expéditeur traversaient bruts
 * `formatCompactThread`, `getThreadSummary` et `MessagePrompt`, c'est-à-dire jusqu'à un modèle
 * PORTEUR D'OUTILS (routes/agent/tools.ts conserve `webSearch` : le canal de sortie existe).
 * Ces rendus sont des LIGNES (`ID: … | Subject: … | From: …`, jointes par des sauts de ligne) :
 * un saut de ligne dans un sujet fabrique une fausse ligne, donc un faux tour de conversation.
 *
 * On aplatit sur une seule ligne, on retire l'invisible et on borne la longueur. Ce qui est
 * rendu à l'UTILISATEUR n'est pas touché : cette fonction ne sert que les chemins de prompt.
 */
export const sanitizeMailField = (value: string | null | undefined, fallback: string): string => {
  const flattened = flattenField(value ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!flattened) return fallback;
  return flattened.length > MAX_FIELD_LENGTH
    ? `${flattened.slice(0, MAX_FIELD_LENGTH)} […truncated]`
    : flattened;
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
const MAX_STYLE_RULES = 500;
const MAX_STYLE_LENGTH = 200_000;

/**
 * Enveloppe technique posée autour du corps parsé. Nom délibérément hors de tout sélecteur
 * de ce module (ni dans DROPPED_ELEMENTS, ni dans la liste des balises de coupure) : elle
 * doit être inerte. Voir `normalizeRoot` pour la raison de son existence.
 */
const SANITIZER_ROOT_TAG = 'zero-sanitizer-root';

/**
 * Ramène le document à UN SEUL enfant élément à la racine, et rend cet enfant.
 *
 * Sans cela, le chemin coûte du quadratique. `cheerio/slim` parse avec htmlparser2, qui ne
 * synthétise PAS de `<html>` : un mail dont le corps est une longue suite de frères laisse
 * N enfants éléments directement sous la racine. Or `Cheerio._findBySelector` passe ces
 * enfants comme contexte à css-select, dont `prepareContext` appelle `domutils.removeSubsets`
 * — qui fait un `lastIndexOf` PUIS un `includes` sur tout le tableau, pour CHAQUE nœud.
 * Le coût est donc en O(n²) sur le nombre de frères racine, et il est payé À CHAQUE requête
 * racine `$('sel')` : les quatre requêtes fixes de ce module, plus une par sélecteur masquant
 * extrait des `<style>` (jusqu'à MAX_STYLE_RULES).
 *
 * Mesuré (bench) : une seule requête `$('div')` coûte 942 ms sur 40 000 frères racine, contre
 * 5,7 ms si la racine n'a qu'un enfant. `sanitizeMailContent` complet : 3 950 ms à plat contre
 * 98 ms sous un `<div>`, pour exactement les mêmes 40 000 éléments. L'enveloppe coûte ~1 ms et
 * ramène toutes les requêtes suivantes au linéaire. Le chemin de rendu (lib/email-processor)
 * n'est pas touché : il parse avec cheerio complet (parse5), qui produit un `<html>` unique.
 */
const normalizeRoot = ($: CheerioAPI): Element | undefined => {
  $.root().wrapInner(`<${SANITIZER_ROOT_TAG}></${SANITIZER_ROOT_TAG}>`);
  return ($.root().children().toArray() as Element[])[0];
};

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

/**
 * Longueur CSS ramenée en pixels, approximativement. `undefined` quand la valeur n'est pas
 * une longueur (`auto`, `inherit`, `medium`…). L'approximation suffit : on ne compare qu'à
 * zéro, à « minuscule » et à « très loin hors écran ».
 */
const lengthInPixels = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const match = /^(-?\d*\.?\d+)(px|pt|em|rem|%|)$/.exec(value.replace(/\s+/g, '').toLowerCase());
  if (!match) return undefined;

  const size = Number(match[1]);
  if (!Number.isFinite(size)) return undefined;
  if (match[2] === 'pt') return size * (4 / 3);
  if (match[2] === 'em' || match[2] === 'rem') return size * 16;
  return size;
};

const atMost = (value: string | undefined, ceiling: number) => {
  const px = lengthInPixels(value);
  return px !== undefined && px <= ceiling;
};

/**
 * Sous 4 px, le texte n'est plus lisible : c'est du contenu caché, pas de la mention légale.
 * La borne laisse passer les 8-10 px des mentions de bas de mail, réellement lues.
 */
const isTinyFontSize = (value: string | undefined) => atMost(value, 3.99);

/** Opacité nulle ou quasi nulle. `0`, `0.0`, `.0`, `0%` et les valeurs résiduelles. */
const isZeroOpacity = (value: string | undefined) => {
  if (!value) return false;
  const compact = value.replace(/\s+/g, '');
  if (/^0*(?:\.0+)?%$/.test(compact)) return true;
  const opacity = Number(compact);
  return Number.isFinite(opacity) && opacity <= 0.05;
};

/** Couleur de texte invisible : `transparent`, alpha nul, `#rrggbb00`. */
const isTransparent = (value: string | undefined) => {
  if (!value) return false;
  const compact = value.replace(/\s+/g, '').toLowerCase();

  return (
    compact === 'transparent' ||
    /^(?:rgba|hsla)\([^)]*,0*(?:\.0+)?%?\)$/.test(compact) ||
    /^#[0-9a-f]{6}00$/.test(compact) ||
    /^#[0-9a-f]{3}0$/.test(compact)
  );
};

/**
 * Élément poussé hors de l'écran. `-9999px` est la forme canonique ; la borne est fixée à
 * -1 000 px, très au-delà de tout décalage de mise en page légitime dans un mail.
 */
const isPushedOffscreen = (styles: InlineStyle) =>
  ['text-indent', 'left', 'top', 'right', 'bottom', 'margin-left', 'margin-top'].some((property) =>
    atMost(styles[property], -1000),
  );

/** Boîte réduite à rien, contenu rogné : `height:0;overflow:hidden` et ses variantes. */
const isCollapsedBox = (styles: InlineStyle) => {
  const clipped = ['overflow', 'overflow-x', 'overflow-y'].some(
    (property) => styles[property] === 'hidden',
  );
  if (!clipped) return false;

  return ['height', 'max-height', 'width', 'max-width'].some(
    (property) => lengthInPixels(styles[property]) === 0,
  );
};

/** `clip: rect(0,0,0,0)` et sa variante `rect(1px,1px,1px,1px)` — le sr-only historique. */
const isClipHidden = (value: string | undefined) => {
  if (!value) return false;
  const inner = /^rect\((.*)\)$/.exec(value.replace(/\s+/g, ' ').trim());
  if (!inner) return false;

  const parts = (inner[1] ?? '').split(/[\s,]+/).filter(Boolean);
  return parts.length === 4 && parts.every((part) => atMost(part, 1));
};

/** `clip-path: inset(50%)` / `inset(100%)` / `circle(0)` — le sr-only moderne. */
const isClipPathHidden = (value: string | undefined) => {
  if (!value) return false;
  const compact = value.replace(/\s+/g, '').toLowerCase();
  if (/^circle\(0(?:\.0+)?(?:px|%)?[,)]/.test(compact)) return true;

  const inset = /^inset\((\d+(?:\.\d+)?)%/.exec(compact);
  return !!inset && Number(inset[1]) >= 50;
};

/**
 * Un jeu de déclarations rend-il sa cible invisible, quelle qu'en soit la provenance ?
 *
 * Sept techniques ont été ajoutées après sonde : `display:none`, la classe masquante, le
 * blanc-sur-blanc et `@media` étaient neutralisés, mais `position:absolute;left:-9999px`,
 * `text-indent:-9999px`, `height:0;overflow:hidden`, `clip:rect(0,0,0,0)`,
 * `color:transparent`, `color:rgba(0,0,0,0)` et `font-size:1px` ressortaient EN CLAIR vers
 * le modèle. Toutes portent du texte que l'humain ne voit pas — c'est exactement le
 * véhicule de la prompt-injection que ce module existe pour couper.
 */
const declarationsHide = (styles: InlineStyle) =>
  styles.display === 'none' ||
  styles.visibility === 'hidden' ||
  styles.visibility === 'collapse' ||
  isZeroOpacity(styles.opacity) ||
  isTinyFontSize(styles['font-size']) ||
  /\b0(?:\.0+)?(?:px|pt|em|rem)\b/.test(styles.font ?? '') ||
  isTransparent(styles.color) ||
  isPushedOffscreen(styles) ||
  isCollapsedBox(styles) ||
  isClipHidden(styles.clip) ||
  isClipPathHidden(styles['clip-path']);

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

/**
 * Marque les éléments ciblés par des sélecteurs masquants, en UNE requête.
 *
 * Chaque requête racine `$('sel')` balaie tout le document : une par sélecteur, c'est le
 * nombre de règles d'une `<style>` hostile (jusqu'à MAX_STYLE_RULES) qui multiplie le coût.
 * Mesuré : 500 sélecteurs sur 19 000 éléments = 624 ms, contre 46 ms sans feuille de style.
 * css-select accepte une LISTE de sélecteurs — le lot coûte un seul balayage. Un sélecteur
 * illisible fait toutefois échouer le lot entier : on retombe alors sur l'unitaire, qui isole
 * le fautif sans faire échouer la sanitisation.
 */
const collectCssHidden = ($: CheerioAPI, selectors: string[], sink: Set<Element>) => {
  if (!selectors.length) return;

  const mark = (selector: string) => {
    $(selector).each((_, element) => {
      sink.add(element as Element);
    });
  };

  try {
    mark(selectors.join(', '));
    return;
  } catch {
    // Lot rejeté : au moins un sélecteur est hors de ce que css-select sait interpréter.
  }

  for (const selector of selectors) {
    try {
      mark(selector);
    } catch {
      // Sélecteur illisible : ignoré plutôt que de faire échouer toute la sanitisation.
    }
  }
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
    const bounds = checkHtmlBounds(raw);
    if (!bounds.withinBounds) {
      return degradeToPlainText(raw.slice(0, MAX_CONTENT_LENGTH), bounds.reason);
    }

    const $ = load(raw, null, false);
    const sanitizerRoot = normalizeRoot($);

    // Les feuilles de style sont lues AVANT d'être retirées : leurs règles décident de la
    // visibilité des éléments qui les référencent par classe ou par identifiant.
    const cssHidden = new Set<Element>();
    collectCssHidden($, hidingSelectorsFromStyleSheets($), cssHidden);
    // L'enveloppe technique n'est jamais masquable : sans cela, un `* { display:none }`
    // hostile la marquerait et ferait disparaître le message en UN segment au lieu de N,
    // c'est-à-dire changerait la sortie du seul fait de l'enveloppe.
    if (sanitizerRoot) cssHidden.delete(sanitizerRoot);

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
