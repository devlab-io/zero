// @ts-ignore
import { CssSanitizer } from '@barkleapp/css-sanitizer';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';

// Import isolé du bloc ci-dessus : le tri d'imports de prettier réordonne les lignes d'un
// même bloc, ce qui détacherait la directive de suppression de type de l'import qu'elle
// couvre (première ligne du fichier) et ferait échouer le typecheck.
import { checkHtmlBounds, MAX_HTML_LENGTH } from './html-bounds';

const sanitizer = new CssSanitizer();

interface ProcessEmailOptions {
  html: string;
  shouldLoadImages: boolean;
  theme: 'light' | 'dark';
}

// --- Inline `style="..."` hardening (audit: CSP/iframe-sandbox gap, attribute-level) ---------
//
// Prior to this, the `style` HTML attribute was allowed on every tag with NO value filtering:
// a hostile email could ship `style="position:fixed;z-index:999999;inset:0"` and overlay the
// entire app shell (clickjacking / fake UI), or `style="background-image:url(https://evil/x.gif)"`
// as an untracked exfil/tracking beacon that bypassed the <img>-only image-blocking logic below.
//
// `SAFE_VALUE` encodes "does this value avoid url()/expression()/legacy script vectors" as a single
// reusable RegExp (sanitize-html's `allowedStyles` takes an array of RegExp per property; the value
// is allowed if ANY regex matches). `SAFE_BACKGROUND_VALUE` is the same idea but carves out normal
// `url(https://...)`/`url(data:...)`/`url(cid:...)` backgrounds — those are legitimate and are
// handled by the preference-gated image-blocking pass in `applyEmailPreferences` below, not banned
// outright here; only script-executing pseudo-schemes inside url() are rejected at this layer.
const DANGEROUS_VALUE_FRAGMENT = 'url\\s*\\(|expression\\s*\\(|-moz-binding|javascript:|vbscript:';
const SAFE_VALUE = new RegExp(`^((?!${DANGEROUS_VALUE_FRAGMENT}).)*$`, 'is');
const SAFE_BACKGROUND_VALUE = new RegExp(
  `^((?!expression\\s*\\(|-moz-binding|javascript:|vbscript:|url\\s*\\(\\s*['"]?\\s*(?:javascript|vbscript|data:text\\/html)).)*$`,
  'is',
);

// Property allowlist: everything a legitimate email needs for text/box formatting. Deliberately
// EXCLUDES position/top/right/bottom/left/z-index/transform/filter/content/cursor/pointer-events/
// animation*/transition*/clip-path (the overlay + code-adjacent surface a Shadow DOM does not
// isolate against) — any property not listed here is stripped by sanitize-html regardless of value.
const SAFE_STYLE_PROPERTIES = [
  'color',
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-decoration-color',
  'text-decoration-line',
  'text-transform',
  'text-indent',
  'white-space',
  'word-break',
  'word-wrap',
  'overflow-wrap',
  'vertical-align',
  'width',
  'height',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'table-layout',
  'display',
  'float',
  'clear',
  'list-style',
  'list-style-type',
  'list-style-position',
  'opacity',
  'box-sizing',
  'background-color',
] as const;

// --- Blocs `<style>` : filtre maison, parce que la dépendance ne filtre pas -----------------
//
// `@barkleapp/css-sanitizer` a été vérifié dans son code : `sanitizeCss(css)` ne prend QU'UN
// argument (src/index.js:75) — l'objet de configuration passé au second était purement ignoré —
// et son constructeur fait l'UNION de ses 66 propriétés par défaut avec celles du caller
// (src/index.js:48), si bien qu'on ne peut qu'AJOUTER des propriétés, jamais en retirer.
// `position`, `z-index`, `transform`, `content`, `animation`, `filter` et `clip-path` sont
// autorisés par défaut. Autrement dit : durcir l'attribut `style` sans toucher aux blocs
// `<style>` déplaçait simplement l'attaque d'une balise à l'autre.
//
// Ce filtre applique aux déclarations d'un bloc `<style>` exactement la même allowlist de
// propriétés et les mêmes règles de valeur que l'attribut inline, puis jette les règles vides.
// Les at-rules sont retirées : `@import` charge du CSS distant (fuite + contournement), et le
// reste (`@media`, `@keyframes`) n'apporte rien qu'un email ait besoin de faire ici.
const MAX_STYLE_BLOCK_LENGTH = 100_000;
const MAX_STYLE_BLOCK_RULES = 300;
const SAFE_STYLE_PROPERTY_SET: Set<string> = new Set(SAFE_STYLE_PROPERTIES);

export const filterStyleBlockCss = (css: string): string => {
  if (!css || css.length > MAX_STYLE_BLOCK_LENGTH) return '';

  const withoutAtRules = css.replace(/@[^;{]*(?:;|\{[^{}]*\})/g, ' ');
  const rules: string[] = [];

  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutAtRules))) {
    if (rules.length >= MAX_STYLE_BLOCK_RULES) break;

    const selector = (match[1] ?? '').trim();
    if (!selector) continue;

    const declarations = (match[2] ?? '')
      .split(';')
      .map((declaration) => {
        const separator = declaration.indexOf(':');
        if (separator === -1) return null;

        const property = declaration.slice(0, separator).trim().toLowerCase();
        const value = declaration.slice(separator + 1).trim();
        if (!SAFE_STYLE_PROPERTY_SET.has(property) || !value) return null;

        const allowed = property.startsWith('background')
          ? SAFE_BACKGROUND_VALUE.test(value)
          : SAFE_VALUE.test(value);
        return allowed ? `${property}: ${value}` : null;
      })
      .filter((declaration): declaration is string => declaration !== null);

    if (declarations.length) rules.push(`${selector} { ${declarations.join('; ')} }`);
  }

  return rules.join('\n');
};

const ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    ...Object.fromEntries(SAFE_STYLE_PROPERTIES.map((property) => [property, [SAFE_VALUE]])),
    // Allowed structurally so the preference-gated pass in `applyEmailPreferences` can still see
    // and conditionally strip them; the value regex above only blocks script-executing schemes.
    background: [SAFE_BACKGROUND_VALUE],
    'background-image': [SAFE_BACKGROUND_VALUE],
  },
};

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

    // Schémas globaux : `data` en a été RETIRÉ. Il y était autorisé pour toutes les balises,
    // si bien qu'un `<a href="data:text/html;base64,...">` traversait le sanitiseur intact
    // (vérifié par sonde DOM) : un clic ouvrait un document contrôlé par l'expéditeur. Le
    // besoin légitime — images inline encodées — est couvert par `allowedSchemesByTag.img`
    // juste en dessous, qui SURCHARGE cette liste pour les `<img>` et continue donc
    // d'accepter `data:` et `cid:`.
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'cid'],
    },

    // Whitelist of style properties/values allowed in the `style="..."` attribute (see
    // SAFE_STYLE_PROPERTIES/SAFE_VALUE above). Anything else — including position/z-index/url() —
    // is dropped by sanitize-html's own postcss-based attribute parser.
    allowedStyles: ALLOWED_STYLES,

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
    // La lib passe d'abord (elle normalise et retire quelques vecteurs), puis notre filtre
    // impose l'allowlist que sa propre API ne sait pas restreindre.
    const css = $(el).html() || '';
    $(el).html(filterStyleBlockCss(sanitizer.sanitizeCss(css)));
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

// Matches a `background`/`background-image` declaration whose `url(...)` argument is not a `cid:`
// reference — i.e. one that would trigger a real network request. Used to extend image-loading
// preferences (which previously only covered `<img src>`) to CSS backgrounds set via the `style`
// attribute, so a remote background-image can't be used to bypass the "block remote images" gate.
const REMOTE_BACKGROUND_URL_PATTERN =
  /background(?:-image)?\s*:\s*[^;]*url\(\s*['"]?(?!cid:)[^'")]+['"]?\s*\)[^;]*;?/gi;

function stripRemoteBackgroundImages(styleValue: string): { style: string; blocked: boolean } {
  let blocked = false;
  const style = styleValue
    .replace(REMOTE_BACKGROUND_URL_PATTERN, () => {
      blocked = true;
      return '';
    })
    .trim();
  return { style, blocked };
}

// Client-side: Light styling + image preferences
export function applyEmailPreferences(
  preprocessedHtml: string,
  theme: 'light' | 'dark',
  shouldLoadImages: boolean,
): { processedHtml: string; hasBlockedImages: boolean } {
  let hasBlockedImages = false;
  const isDarkTheme = theme === 'dark';

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

    // Same gate for CSS backgrounds set via `style="background(-image): url(...)"` — otherwise a
    // remote background-image tracking pixel loads even with "block remote images" enabled.
    $('[style*="background"]').each((_, el) => {
      const $el = $(el);
      const original = $el.attr('style');
      if (!original) return;

      const { style, blocked } = stripRemoteBackgroundImages(original);
      if (!blocked) return;

      hasBlockedImages = true;
      if (style) {
        $el.attr('style', style);
      } else {
        $el.removeAttr('style');
      }
    });
  }

  const html = $.html();

  const finalHtml = `${emailThemeStyles(isDarkTheme)}${html}`;

  return {
    processedHtml: finalHtml,
    hasBlockedImages,
  };
}

// Feuille de style du conteneur, extraite d'`applyEmailPreferences` pour que le repli en
// texte brut (`degradeToPlainText`) rende exactement le même cadre visuel.
function emailThemeStyles(isDarkTheme: boolean): string {
  return `
    <style type="text/css">
      :host {
        display: block;
        line-height: 1.5;
        background-color: ${isDarkTheme ? '#1A1A1A' : '#ffffff'};
        color: ${isDarkTheme ? '#ffffff' : '#000000'};
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
        color: ${isDarkTheme ? '#60a5fa' : '#2563eb'};
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
        border-left: 2px solid ${isDarkTheme ? '#374151' : '#d1d5db'};
        padding-left: 8px;
        margin-top: 0.75rem;
      }

      details.quoted-toggle summary {
        cursor: pointer;
        color: ${isDarkTheme ? '#9CA3AF' : '#6B7280'};
        list-style: none;
        user-select: none;
      }

      details.quoted-toggle summary::-webkit-details-marker {
        display: none;
      }

      [data-theme-color="muted"] {
        color: ${isDarkTheme ? '#9CA3AF' : '#6B7280'};
      }

      pre.zero-degraded-body {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: inherit;
        margin: 0;
      }
    </style>
  `;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Repli LINÉAIRE, sans parseur : les balises sont retirées par balayage, le reste est échappé
 * puis rendu comme du texte. C'est ce qui rend `processEmailHtml` totale — un message qu'on
 * refuse de parser s'affiche dégradé au lieu de disparaître du fil (open-thread.ts avalait
 * l'exception) ou de rendre un 500 (mail.ts).
 */
function degradeToPlainText(
  html: string,
  theme: 'light' | 'dark',
  reason: string,
): { processedHtml: string; hasBlockedImages: boolean } {
  const text = html
    .slice(0, MAX_HTML_LENGTH)
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const body = `
    <div class="zero-degraded-email" data-degraded-reason="${escapeHtml(reason)}">
      <p data-theme-color="muted">This message could not be rendered safely (${escapeHtml(
        reason,
      )}); it is shown as plain text.</p>
      <pre class="zero-degraded-body">${escapeHtml(text)}</pre>
    </div>
  `;

  return { processedHtml: `${emailThemeStyles(theme === 'dark')}${body}`, hasBlockedImages: false };
}

/**
 * Point d'entrée du chemin de RENDU. Totale : elle ne lève jamais.
 *
 * Les bornes (taille, profondeur d'imbrication) sont évaluées AVANT tout parsing par un scan
 * linéaire — c'est le parseur récursif lui-même qui débordait la pile, une `RangeError` mesurée
 * dès ~2 000-3 000 niveaux d'imbrication. Le `catch` couvre le reste : toute défaillance interne
 * du sanitiseur dégrade en texte au lieu de remonter à l'appelant.
 */
export function processEmailHtml({ html, shouldLoadImages, theme }: ProcessEmailOptions): {
  processedHtml: string;
  hasBlockedImages: boolean;
} {
  const raw = html ?? '';

  const bounds = checkHtmlBounds(raw);
  if (!bounds.withinBounds) return degradeToPlainText(raw, theme, bounds.reason);

  try {
    const preprocessed = preprocessEmailHtml(raw);
    return applyEmailPreferences(preprocessed, theme, shouldLoadImages);
  } catch (error) {
    return degradeToPlainText(
      raw,
      theme,
      `renderer error: ${error instanceof Error ? error.name : 'unknown'}`,
    );
  }
}
