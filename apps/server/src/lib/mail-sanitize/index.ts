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

/**
 * Retire les commentaires CSS.
 *
 * CONSTAT (11 charges sur 27 passaient) : un commentaire est un séparateur de jetons LÉGAL
 * partout dans une déclaration. `style="display:/*x*&#47;none"` vaut `display:none` pour le
 * navigateur — donc invisible pour l'humain — mais la comparaison littérale
 * `styles.display === 'none'` échouait et le texte caché repartait EN CLAIR vers le modèle.
 * Le retrait se fait sur la chaîne ENTIÈRE avant tout découpage, car un commentaire peut
 * contenir `;`, `:`, `{` ou `}` et fausserait sinon le découpage lui-même.
 *
 * Un commentaire non fermé mange le reste de l'entrée, exactement comme dans un navigateur.
 * Le remplacement par une ESPACE (et non par la chaîne vide) préserve la séparation des
 * jetons : `10/**&#47;px` ne doit pas devenir `10px`.
 */
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ');

/**
 * Normalisation d'une valeur de déclaration AVANT toute comparaison : `!important` retiré,
 * espaces internes (y compris sauts de ligne et tabulations) réduits à une espace simple,
 * casse abaissée. Sans elle, `display:\n  NONE` ou `visibility:  hidden` — deux formes
 * parfaitement légales — échappaient à la détection.
 */
const normalizeDeclarationValue = (value: string): string =>
  value
    .replace(/!\s*important/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const parseInlineStyle = (style: string | undefined): InlineStyle =>
  Object.fromEntries(
    stripCssComments(style ?? '')
      .split(';')
      .map((rule) => {
        const separator = rule.indexOf(':');
        if (separator === -1) return null;

        // Le nom de propriété est seulement RECADRÉ, pas compacté : un identifiant CSS ne
        // peut pas contenir d'espace, et `dis/*x*/play` reste donc invalide APRÈS retrait du
        // commentaire — comme dans un navigateur, qui rejette la déclaration et laisse le
        // contenu VISIBLE. Le compacter fabriquerait un faux positif qui retrancherait du
        // texte réellement lu par l'humain.
        const property = rule.slice(0, separator).trim().toLowerCase();
        const value = normalizeDeclarationValue(rule.slice(separator + 1));

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
 * Facteurs de conversion vers le pixel CSS. Seules `px|pt|em|rem` étaient reconnues : une
 * taille de police en `in`, `cm`, `mm`, `q`, `pc`, `ex` ou `ch` — toutes légales, toutes
 * rendues par les clients de messagerie — rendait `lengthInPixels` indécis, donc le texte
 * minuscule ressortait en clair. `%` conserve sa valeur numérique (l'usage n'en compare que
 * le zéro et les grandes valeurs négatives).
 */
const CSS_UNIT_TO_PIXELS: Record<string, number> = {
  '': 1,
  '%': 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  em: 16,
  rem: 16,
  ex: 8,
  ch: 8,
};

/**
 * Longueur CSS ramenée en pixels, approximativement. `undefined` quand la valeur n'est pas
 * une longueur (`auto`, `inherit`, `medium`…). L'approximation suffit : on ne compare qu'à
 * zéro, à « minuscule » et à « très loin hors écran ».
 */
const lengthInPixels = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const match = /^(-?\d*\.?\d+)([a-z%]*)$/.exec(value.replace(/\s+/g, '').toLowerCase());
  if (!match) return undefined;

  const size = Number(match[1]);
  if (!Number.isFinite(size)) return undefined;
  // Zéro est zéro dans TOUTE unité, y compris celles qui dépendent du contexte (`vw`, `vh`)
  // et qu'on ne saurait pas convertir autrement.
  if (size === 0) return 0;

  const factor = CSS_UNIT_TO_PIXELS[match[2] ?? ''];
  return factor === undefined ? undefined : size * factor;
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

/**
 * Raccourci `font` portant une taille invisible.
 *
 * Deux formes, et deux seulement, pour ne pas fabriquer de faux positif :
 *   - `font: 0/0 a`, la ruse classique : taille nulle SANS unité, suivie de la hauteur de
 *     ligne ;
 *   - un jeton porteur d'une UNITÉ explicite et minuscule (`font: 1px Arial`).
 * Les jetons sans unité sont autrement ignorés : dans `font: bold 12px/1.5 Arial`, `1.5` est
 * une hauteur de ligne, pas une taille, et la traiter comme telle retrancherait un mail
 * parfaitement lisible.
 */
const isTinyFontShorthand = (value: string | undefined) => {
  if (!value) return false;
  if (/(?:^|\s)0(?:\.0+)?\s*\/\s*\d/.test(value)) return true;

  return value
    .split(/[\s/]+/)
    .some((token) => /^-?\d*\.?\d+[a-z]+$/.test(token) && isTinyFontSize(token));
};

/** Opacité nulle ou quasi nulle. `0`, `0.0`, `.0`, `0%` et les valeurs résiduelles. */
const isZeroOpacity = (value: string | undefined) => {
  if (!value) return false;
  const compact = value.replace(/\s+/g, '');
  if (/^0*(?:\.0+)?%$/.test(compact)) return true;
  const opacity = Number(compact);
  return Number.isFinite(opacity) && opacity <= 0.05;
};

/** Une composante alpha écrite `0`, `0.0`, `.0`, `00` ou `0%`. */
const isZeroAlpha = (alpha: string) => alpha.length > 0 && /^0*(?:\.0+)?%?$/.test(alpha);

/**
 * Couleur de texte invisible : `transparent`, alpha nul, `#rrggbb00`.
 *
 * L'alpha n'est plus cherché par un motif figé sur `rgba(…,0)` mais LU comme composante :
 * la syntaxe moderne `rgb(0 0 0 / 0)` (CSS Color 4, séparateur `/`, acceptée par tous les
 * moteurs) échappait entièrement à l'ancienne expression. Le nombre de composantes est
 * compté pour ne pas prendre le TROISIÈME argument de `rgb(0,0,0)` — du noir parfaitement
 * visible — pour un alpha nul.
 */
const isTransparent = (value: string | undefined) => {
  if (!value) return false;
  const compact = value.replace(/\s+/g, '').toLowerCase();

  if (compact === 'transparent') return true;
  if (/^#[0-9a-f]{6}00$/.test(compact)) return true;
  if (/^#[0-9a-f]{3}0$/.test(compact)) return true;

  const call = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((.*)\)$/.exec(compact);
  if (!call) return false;
  const inner = call[1] ?? '';

  const slash = inner.lastIndexOf('/');
  if (slash !== -1) return isZeroAlpha(inner.slice(slash + 1));

  const parts = inner.split(',');
  return parts.length === 4 && isZeroAlpha(parts[3] ?? '');
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
  isTinyFontShorthand(styles.font) ||
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
  // Commentaires retirés AVANT le découpage en règles : un `/* } */` suffisait sinon à
  // désaligner ce découpage et à faire disparaître la règle masquante du lot.
  const source = stripCssComments(css).slice(0, MAX_STYLE_LENGTH);
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
