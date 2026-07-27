// lib/html-bounds.ts — bornes d'entrée communes aux deux chemins qui parsent du HTML d'email.
//
// Un parseur HTML descend récursivement : une imbrication suffisamment profonde fait déborder
// la pile, et l'exception traverse tout l'appelant. `lib/mail-sanitize` (chemin LLM) s'était
// déjà doté de ces bornes ; `lib/email-processor` (chemin de rendu) ne les avait pas et levait
// une `RangeError: Maximum call stack size exceeded` dès ~2 000-3 000 niveaux, avec deux
// conséquences mesurées : trpc/routes/open-thread.ts avale l'erreur et le message DISPARAÎT du
// fil, trpc/routes/mail.ts rend un 500. Les bornes vivent ici pour que les deux chemins
// partagent la même définition plutôt que d'en diverger.
//
// La borne sur le NOMBRE d'éléments est venue ensuite : la taille et la profondeur ne
// disaient rien d'un mail PLAT et massif (200 000 frères en 1,6 Mo, profondeur 1), qui
// passait les deux contrôles et faisait brûler 96 s de CPU au sanitiseur.

/** Au-delà, on ne parse pas : on dégrade. 2 Mo couvre très largement un mail légitime. */
export const MAX_HTML_LENGTH = 2_000_000;

/** Profondeur d'imbrication au-delà de laquelle un parseur récursif n'est plus sûr. */
export const MAX_HTML_NESTING_DEPTH = 300;

/**
 * Nombre d'ÉLÉMENTS au-delà duquel on ne parse pas. La taille seule ne borne rien d'utile :
 * 1,6 Mo de `<div>x</div>` tiennent sous la borne des 2 Mo tout en portant 200 000 éléments.
 *
 * Valeur calibrée sur un corpus de mails aux formes réelles (bench, comptage via cheerio) :
 *   réponse simple .......................  0,2 kB —      5 éléments
 *   fil à 12 citations empilées ..........  4,6 kB —     75 éléments
 *   reçu transactionnel, 24 lignes .......  6,5 kB —    216 éléments
 *   newsletter marketing, 80 produits .... 46,8 kB —    654 éléments
 *   catalogue e-commerce, 150 produits ... 90,2 kB —  2 254 éléments
 * Le dernier frôle déjà le seuil de rognage de Gmail (~102 kB) : c'est le plafond de ce
 * qu'un mail légitime atteint en pratique. 20 000 laisse ~9× de marge au-dessus, et reste
 * deux ordres de grandeur sous les 200 000 éléments de la charge de déni de service.
 */
export const MAX_HTML_ELEMENTS = 20_000;

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

export type HtmlStructure = { depth: number; elements: number };

/**
 * Profondeur d'imbrication et nombre d'éléments estimés, en UNE passe linéaire et sans
 * allocation de DOM. C'est le point : la mesure doit précéder le parsing, puisque c'est le
 * parseur qui déborde. Le balayage s'arrête dès que la profondeur franchit sa borne — le
 * verdict est alors déjà rendu, le compte d'éléments n'a plus à être exact.
 */
export const scanHtmlStructure = (content: string): HtmlStructure => {
  let depth = 0;
  let max = 0;
  let elements = 0;

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '<') continue;

    const closing = content[i + 1] === '/';
    const start = i + (closing ? 2 : 1);
    let end = start;
    while (end < content.length && /[a-zA-Z0-9]/.test(content[end] as string)) end++;
    if (end === start) continue;

    const tag = content.slice(start, end).toLowerCase();
    if (VOID_ELEMENTS.has(tag)) {
      if (!closing) elements++;
      continue;
    }

    if (closing) {
      depth = Math.max(0, depth - 1);
    } else {
      elements++;
      const close = content.indexOf('>', end);
      const selfClosing = close > 0 && content[close - 1] === '/';
      if (!selfClosing) {
        depth++;
        if (depth > max) max = depth;
        if (max > MAX_HTML_NESTING_DEPTH) return { depth: max, elements };
      }
    }
  }

  return { depth: max, elements };
};

export type HtmlBoundsVerdict = { withinBounds: true } | { withinBounds: false; reason: string };

/** Verdict unique : ce HTML peut-il être confié à un parseur récursif ? */
export const checkHtmlBounds = (content: string): HtmlBoundsVerdict => {
  if (content.length > MAX_HTML_LENGTH) {
    return { withinBounds: false, reason: 'content exceeded the size limit' };
  }
  const { depth, elements } = scanHtmlStructure(content);
  if (depth > MAX_HTML_NESTING_DEPTH) {
    return { withinBounds: false, reason: 'content exceeded the nesting-depth limit' };
  }
  if (elements > MAX_HTML_ELEMENTS) {
    return { withinBounds: false, reason: 'content exceeded the element-count limit' };
  }
  return { withinBounds: true };
};
