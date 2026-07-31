// @ts-expect-error -- @barkleapp/css-sanitizer does not publish TypeScript declarations.
import { CssSanitizer } from '@barkleapp/css-sanitizer';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';

const sanitizer = new CssSanitizer();

interface ProcessEmailOptions {
  html: string;
  shouldLoadImages: boolean;
  theme: 'light' | 'dark';
}

// Server-side: Heavy lifting, preference-independent processing
export function preprocessEmailHtml(html: string): string {
  const sanitizeConfig: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'title',
      'details',
      'summary',
      'style',
    ]),

    allowedAttributes: {
      '*': [
        'class',
        'style',
        'align',
        'valign',
        'width',
        'height',
        'cellpadding',
        'cellspacing',
        'border',
        'bgcolor',
        'colspan',
        'rowspan',
      ],
      a: ['href', 'name', 'target', 'rel', 'class', 'style'],
      img: ['src', 'alt', 'width', 'height', 'class', 'style'],
    },

    // Allow only safe schemes - no blob for security
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'cid'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'cid'],
    },

    transformTags: {
      a: (tagName, attribs) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            target: attribs.target || '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
    },
  };

  const sanitized = sanitizeHtml(html, sanitizeConfig);
  const $ = cheerio.load(sanitized);

  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const safe = sanitizer.sanitizeCss(css, {
      allowedProperties: [
        'color',
        'background-color',
        'font-size',
        'margin',
        'padding',
        'text-align',
        'border',
        'display',
      ],
      disallowedAtRules: ['import', 'keyframes'],
      disallowedFunctions: ['expression', 'url'],
    });
    $(el).html(safe);
  });

  // Collapse quoted text (structure only, no theme colors)
  const collapseQuoted = (selector: string) => {
    $(selector).each((_, el) => {
      const $el = $(el);
      if ($el.parents('details.quoted-toggle').length) return;

      const innerHtml = $el.html();
      if (typeof innerHtml !== 'string') return;
      const detailsHtml = `<details class="quoted-toggle" style="margin-top:1em;">
          <summary style="cursor:pointer;" data-theme-color="muted">
            Show quoted text
          </summary>
          ${innerHtml}
        </details>`;

      $el.replaceWith(detailsHtml);
    });
  };

  collapseQuoted('blockquote');
  collapseQuoted('.gmail_quote');

  // Remove unwanted elements
  $('title').remove();
  $('img[width="1"][height="1"]').remove();
  $('img[width="0"][height="0"]').remove();

  // Remove preheader content
  $('.preheader, .preheaderText, [class*="preheader"]').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style') || '';
    if (
      style.includes('display:none') ||
      style.includes('display: none') ||
      style.includes('font-size:0') ||
      style.includes('font-size: 0') ||
      style.includes('line-height:0') ||
      style.includes('line-height: 0') ||
      style.includes('max-height:0') ||
      style.includes('max-height: 0') ||
      style.includes('mso-hide:all') ||
      style.includes('opacity:0') ||
      style.includes('opacity: 0')
    ) {
      $el.remove();
    }
  });

  return $.html();
}

// ————————————————————————————————————————————————————————————————————————
// Réparation de contraste CONTEXTUELLE (r17). Preuve prod : « Récap Kura
// fournisseurs — 31/07/2026 » est authoré en texte blanc inline pour un client
// sombre, sans fond explicite ; notre canevas hôte étant forcé light (correctif
// Microsoft ci-dessous, conservé), le texte devient blanc-sur-blanc, visible
// uniquement sélectionné. Règle : un texte clair n'est réécrit en sombre QUE
// si son contexte de fond effectif est clair (canevas implicite, ou ancêtre le
// plus proche à fond explicite clair). Un fond ancêtre explicitement sombre —
// ou non interprétable (gradient, image, var()) — préserve le texte tel quel :
// jamais d'override global qui casserait les vrais emails sombres.
// ————————————————————————————————————————————————————————————————————————

type Rgb = [number, number, number];

// Couleurs nommées pertinentes pour l'arbitrage clair/sombre. Un nom absent
// de cette table est traité comme NON interprétable → conservateur (aucune
// réécriture, aucun classement de fond).
const NAMED_COLORS: Record<string, Rgb> = {
  white: [255, 255, 255],
  snow: [255, 250, 250],
  ivory: [255, 255, 240],
  ghostwhite: [248, 248, 255],
  whitesmoke: [245, 245, 245],
  floralwhite: [255, 250, 240],
  aliceblue: [240, 248, 255],
  mintcream: [245, 255, 250],
  honeydew: [240, 255, 240],
  azure: [240, 255, 255],
  seashell: [255, 245, 238],
  lavenderblush: [255, 240, 245],
  oldlace: [253, 245, 230],
  linen: [250, 240, 230],
  cornsilk: [255, 248, 220],
  beige: [245, 245, 220],
  lightyellow: [255, 255, 224],
  lightcyan: [224, 255, 255],
  gainsboro: [220, 220, 220],
  lightgrey: [211, 211, 211],
  lightgray: [211, 211, 211],
  silver: [192, 192, 192],
  black: [0, 0, 0],
  navy: [0, 0, 128],
  darkblue: [0, 0, 139],
  midnightblue: [25, 25, 112],
  maroon: [128, 0, 0],
  darkgreen: [0, 100, 0],
  darkslategray: [47, 79, 79],
  darkslategrey: [47, 79, 79],
  dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
};

function parseCssColor(raw: string): Rgb | null {
  const value = raw
    .trim()
    .replace(/\s*!important\s*$/i, '')
    .toLowerCase();

  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return [
        parseInt(digits[0] + digits[0], 16),
        parseInt(digits[1] + digits[1], 16),
        parseInt(digits[2] + digits[2], 16),
      ];
    }
    if (digits.length === 6 || digits.length === 8) {
      return [
        parseInt(digits.slice(0, 2), 16),
        parseInt(digits.slice(2, 4), 16),
        parseInt(digits.slice(4, 6), 16),
      ];
    }
    return null;
  }

  const rgb = value.match(
    /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgb) {
    const channel = (token: string) =>
      token.endsWith('%') ? (parseFloat(token) / 100) * 255 : parseFloat(token);
    const alpha = rgb[4] === undefined ? 1 : parseFloat(rgb[4]);
    // Semi-transparent (< 0,5) : la couleur perçue dépend du fond réel —
    // non interprétable, on ne touche pas.
    if (!Number.isFinite(alpha) || alpha < 0.5) return null;
    const parsed: Rgb = [channel(rgb[1]), channel(rgb[2]), channel(rgb[3])];
    return parsed.every(
      (component) => Number.isFinite(component) && component >= 0 && component <= 255,
    )
      ? parsed
      : null;
  }

  return NAMED_COLORS[value] ?? null;
}

/** Luminance relative WCAG (sRGB linéarisé), 0 = noir, 1 = blanc. */
function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (component: number) => {
    const scaled = component / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const [darker, lighter] =
    luminanceA < luminanceB ? [luminanceA, luminanceB] : [luminanceB, luminanceA];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Seuil de réparation : en dessous de 1,9:1 contre le fond clair effectif, le
 * texte est illisible (blanc 1,05 ; #eee 1,2 ; #ccc 1,6 ; #bbb 1,87) — les
 * gris volontairement atténués (#aaa : 2,3 ; #999 : 2,8) restent intacts.
 */
const REPAIR_CONTRAST_THRESHOLD = 1.9;
/** Un fond dont la luminance ≤ 0,37 donne ≥ 2,5:1 à un texte blanc : sombre. */
const DARK_BACKGROUND_MAX_LUMINANCE = 0.37;
const WHITE_LUMINANCE = 1;
/** Couleur de remplacement — le texte par défaut du canevas hôte. */
const REPAIRED_TEXT_COLOR = '#1a1a1a';

type BackgroundContext =
  | { kind: 'light'; luminance: number } // canevas implicite ou fond explicite clair
  | { kind: 'dark' }
  | { kind: 'unknown' }; // gradient/image/var()/nom inconnu : conservateur

const COLOR_DECLARATION = /((?:^|[;\s])color\s*:\s*)([^;]+)/gi;
const BACKGROUND_COLOR_DECLARATION = /(?:^|[;\s])background-color\s*:\s*([^;]+)/gi;
const BACKGROUND_SHORTHAND_DECLARATION = /(?:^|[;\s])background\s*:\s*([^;]+)/gi;

function lastMatchValue(style: string, pattern: RegExp): string | null {
  let value: string | null = null;
  for (const match of style.matchAll(pattern)) value = match[1] ?? null;
  return value;
}

/**
 * Fond explicite d'un élément : background-color inline, sinon raccourci
 * background, sinon attribut legacy bgcolor. `transparent`/`inherit`/etc.
 * n'établissent PAS de fond (le contexte parent continue de s'appliquer).
 */
function resolveOwnBackground(
  style: string,
  bgcolorAttribute: string | undefined,
): BackgroundContext | null {
  const candidates: string[] = [];
  const backgroundColor = lastMatchValue(style, BACKGROUND_COLOR_DECLARATION);
  if (backgroundColor) candidates.push(backgroundColor);
  const shorthand = lastMatchValue(style, BACKGROUND_SHORTHAND_DECLARATION);
  if (shorthand) candidates.push(shorthand);
  if (bgcolorAttribute) candidates.push(bgcolorAttribute);

  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.trim();
    if (/^(transparent|inherit|initial|unset|none)\s*(!important)?$/i.test(candidate)) continue;
    // Image ou gradient : le rendu réel est inconnaissable ici — contexte
    // non interprétable, le texte descendant n'est jamais réécrit.
    if (/url\(|gradient\(/i.test(candidate)) return { kind: 'unknown' };
    // Raccourci : premier token couleur interprétable.
    const token = candidate.split(/\s+/).find((part) => parseCssColor(part) !== null) ?? candidate;
    const parsed = parseCssColor(token);
    if (parsed === null) return { kind: 'unknown' };
    const luminance = relativeLuminance(parsed);
    return luminance <= DARK_BACKGROUND_MAX_LUMINANCE
      ? { kind: 'dark' }
      : { kind: 'light', luminance };
  }
  return null;
}

type DomElement = {
  type: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: DomElement[];
};

/**
 * Héritage suivi pendant la traversée : `original` = la couleur que la cascade
 * de l'AUTEUR donnerait à ce point (dernier `color` d'ancêtre, avant toute
 * réparation) ; `effective` = celle que NOTRE sortie donne (après mutations).
 * La divergence des deux est exactement le cas dangereux : un parent clair
 * réparé en sombre ne doit pas faire hériter du sombre à une section sombre
 * qui comptait sur le blanc de l'auteur (revue r17) — l'originale y est alors
 * matérialisée. L'inverse (section claire héritant du blanc d'un ancêtre
 * sombre) reçoit la couleur réparée.
 */
type InheritedColor = { original: string | null; effective: string | null };

function lastOwnColorValue(style: string): string | null {
  let value: string | null = null;
  for (const match of style.matchAll(COLOR_DECLARATION)) value = match[2] ?? null;
  return value ? value.trim() : null;
}

function isUnreadableOnLight(rawValue: string, backgroundLuminance: number): boolean {
  const parsed = parseCssColor(rawValue);
  if (parsed === null) return false;
  return contrastRatio(relativeLuminance(parsed), backgroundLuminance) < REPAIR_CONTRAST_THRESHOLD;
}

function appendColorDeclaration(attribs: Record<string, string>, value: string): void {
  const style = attribs['style'];
  attribs['style'] =
    style && style.trim().length > 0
      ? `${style.replace(/;\s*$/, '')};color:${value}`
      : `color:${value}`;
}

function repairForegroundContrast($: cheerio.CheerioAPI): void {
  const visit = (
    element: DomElement,
    context: BackgroundContext,
    inherited: InheritedColor,
  ): void => {
    if (element.type !== 'tag' && element.type !== 'root') return;

    let nextContext = context;
    let nextInherited = inherited;
    if (element.type === 'tag' && element.attribs) {
      const attribs = element.attribs;
      const style = attribs['style'] ?? '';
      const own = resolveOwnBackground(style, attribs['bgcolor']);
      if (own !== null) nextContext = own;

      const ownColor = lastOwnColorValue(style);
      if (ownColor !== null) {
        let effective = ownColor;
        if (nextContext.kind === 'light') {
          const backgroundLuminance = nextContext.luminance;
          if (isUnreadableOnLight(ownColor, backgroundLuminance)) effective = REPAIRED_TEXT_COLOR;
          const repaired = style.replace(
            COLOR_DECLARATION,
            (declaration, prefix: string, rawValue: string) => {
              if (!isUnreadableOnLight(rawValue, backgroundLuminance)) return declaration;
              const important = /!important\s*$/i.test(rawValue.trim()) ? ' !important' : '';
              return `${prefix}${REPAIRED_TEXT_COLOR}${important}`;
            },
          );
          if (repaired !== style) attribs['style'] = repaired;
        }
        nextInherited = { original: ownColor, effective };
      } else if (
        (nextContext.kind === 'dark' || nextContext.kind === 'unknown') &&
        inherited.original !== null &&
        inherited.effective !== inherited.original
      ) {
        // Sous-arbre sombre/inconnu héritant d'un ancêtre RÉPARÉ : la couleur
        // d'auteur originale est matérialisée ici — le rendu du sous-arbre
        // sombre est strictement celui voulu par l'auteur.
        appendColorDeclaration(attribs, inherited.original);
        nextInherited = { original: inherited.original, effective: inherited.original };
      } else if (
        nextContext.kind === 'light' &&
        inherited.effective !== null &&
        isUnreadableOnLight(inherited.effective, nextContext.luminance)
      ) {
        // Inverse : section à fond clair héritant d'un texte clair posé pour
        // un ancêtre sombre — illisible ici, réparée localement sans toucher
        // l'ancêtre.
        appendColorDeclaration(attribs, REPAIRED_TEXT_COLOR);
        nextInherited = { original: inherited.original, effective: REPAIRED_TEXT_COLOR };
      }
    }

    for (const child of element.children ?? []) visit(child, nextContext, nextInherited);
  };

  const root = $.root()[0] as unknown as DomElement | undefined;
  if (root) {
    visit(root, { kind: 'light', luminance: WHITE_LUMINANCE }, { original: null, effective: null });
  }
}

// Client-side: Light styling + image preferences
export function applyEmailPreferences(
  preprocessedHtml: string,
  _theme: 'light' | 'dark',
  shouldLoadImages: boolean,
): { processedHtml: string; hasBlockedImages: boolean } {
  let hasBlockedImages = false;

  const $ = cheerio.load(preprocessedHtml);

  // Handle image blocking if needed
  if (!shouldLoadImages) {
    $('img').each((_, el) => {
      const $img = $(el);
      const src = $img.attr('src');

      // Allow CID images (inline attachments)
      if (src && !src.startsWith('cid:')) {
        hasBlockedImages = true;
        $img.replaceWith(`<span style="display:none;"><!-- blocked image: ${src} --></span>`);
      }
    });
  }

  // r17 : réparation de contraste contextuelle — APRÈS le blocage d'images
  // (les spans masqués n'ont pas de texte), AVANT la sérialisation. Ne touche
  // que le texte clair en contexte de fond clair/implicite ; les emails
  // réellement sombres (fond explicite sombre, racine sombre) et les fonds
  // non interprétables sont préservés tels quels.
  repairForegroundContrast($);

  const html = $.html();

  // Email HTML is authored against a light default canvas unless it declares
  // its own background. Making the implicit canvas dark leaves sender-defined
  // colors such as Microsoft's #242424 almost black on black. Keep the neutral
  // email canvas light in both app themes; genuinely dark emails retain their
  // explicit backgrounds and text colors.
  const themeStyles = `
    <style type="text/css">
      :host {
        display: block;
        line-height: 1.5;
        color-scheme: only light;
        background-color: #ffffff;
        color: #1a1a1a;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
      }

      a {
        cursor: pointer;
        color: #2563eb;
        text-decoration: underline;
      }

      table {
        border-collapse: collapse;
      }

      ::selection {
        background: #b3d4fc;
        text-shadow: none;
      }

      /* Styling for collapsed quoted text */
      details.quoted-toggle {
        border-left: 2px solid #d1d5db;
        padding-left: 8px;
        margin-top: 0.75rem;
      }

      details.quoted-toggle summary {
        cursor: pointer;
        color: #6B7280;
        list-style: none;
        user-select: none;
      }

      details.quoted-toggle summary::-webkit-details-marker {
        display: none;
      }

      [data-theme-color="muted"] {
        color: #6B7280;
      }
    </style>
  `;

  const finalHtml = `${themeStyles}${html}`;

  return {
    processedHtml: finalHtml,
    hasBlockedImages,
  };
}

// Original function for backward compatibility
export function processEmailHtml({ html, shouldLoadImages, theme }: ProcessEmailOptions): {
  processedHtml: string;
  hasBlockedImages: boolean;
} {
  const preprocessed = preprocessEmailHtml(html);
  return applyEmailPreferences(preprocessed, theme, shouldLoadImages);
}
