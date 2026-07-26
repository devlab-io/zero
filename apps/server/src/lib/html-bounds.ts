// lib/html-bounds.ts — bornes d'entrée communes aux deux chemins qui parsent du HTML d'email.
//
// Un parseur HTML descend récursivement : une imbrication suffisamment profonde fait déborder
// la pile, et l'exception traverse tout l'appelant. `lib/mail-sanitize` (chemin LLM) s'était
// déjà doté de ces bornes ; `lib/email-processor` (chemin de rendu) ne les avait pas et levait
// une `RangeError: Maximum call stack size exceeded` dès ~2 000-3 000 niveaux, avec deux
// conséquences mesurées : trpc/routes/open-thread.ts avale l'erreur et le message DISPARAÎT du
// fil, trpc/routes/mail.ts rend un 500. Les bornes vivent ici pour que les deux chemins
// partagent la même définition plutôt que d'en diverger.

/** Au-delà, on ne parse pas : on dégrade. 2 Mo couvre très largement un mail légitime. */
export const MAX_HTML_LENGTH = 2_000_000;

/** Profondeur d'imbrication au-delà de laquelle un parseur récursif n'est plus sûr. */
export const MAX_HTML_NESTING_DEPTH = 300;

/** Balises sans fermeture : elles n'ajoutent pas de niveau d'imbrication. */
export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Profondeur d'imbrication estimée, en une passe LINÉAIRE et sans allocation de DOM. C'est le
 * point : la mesure doit précéder le parsing, puisque c'est le parseur qui déborde. L'estimation
 * s'arrête dès que la borne est franchie.
 */
export const estimateNestingDepth = (content: string): number => {
  let depth = 0;
  let max = 0;

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '<') continue;

    const closing = content[i + 1] === '/';
    const start = i + (closing ? 2 : 1);
    let end = start;
    while (end < content.length && /[a-zA-Z0-9]/.test(content[end] as string)) end++;
    if (end === start) continue;

    const tag = content.slice(start, end).toLowerCase();
    if (VOID_ELEMENTS.has(tag)) continue;

    if (closing) {
      depth = Math.max(0, depth - 1);
    } else {
      const close = content.indexOf('>', end);
      const selfClosing = close > 0 && content[close - 1] === '/';
      if (!selfClosing) {
        depth++;
        if (depth > max) max = depth;
        if (max > MAX_HTML_NESTING_DEPTH) return max;
      }
    }
  }

  return max;
};

export type HtmlBoundsVerdict = { withinBounds: true } | { withinBounds: false; reason: string };

/** Verdict unique : ce HTML peut-il être confié à un parseur récursif ? */
export const checkHtmlBounds = (content: string): HtmlBoundsVerdict => {
  if (content.length > MAX_HTML_LENGTH) {
    return { withinBounds: false, reason: 'content exceeded the size limit' };
  }
  if (estimateNestingDepth(content) > MAX_HTML_NESTING_DEPTH) {
    return { withinBounds: false, reason: 'content exceeded the nesting-depth limit' };
  }
  return { withinBounds: true };
};
