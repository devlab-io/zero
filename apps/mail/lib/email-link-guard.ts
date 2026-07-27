// lib/email-link-guard.ts — décision, hors composant, de ce qu'un clic dans le corps d'un
// mail a le droit de déclencher.
//
// Le garde d'origine (components/mail/mail-content.tsx) testait `target.tagName === 'A'`. Un
// lien de mail contient presque toujours un enfant — `<b>`, `<span>`, `<img>` : le clic
// atterrit sur l'enfant, `tagName` vaut `B`/`SPAN`/`IMG`, l'interception ne se déclenche pas
// et le navigateur suit le `href` par défaut. Le sanitiseur serveur préserve par ailleurs
// `target="_self"`, donc cette navigation par défaut pouvait remplacer l'application entière
// par la page du lien. On remonte désormais à l'ancêtre `<a>` le plus proche et on n'ouvre que
// des schémas explicitement autorisés.

/** Ce qu'un clic est autorisé à produire. `null` = le clic n'est pas sur un lien. */
export type EmailLinkAction =
  | { kind: 'external'; href: string }
  | { kind: 'mailto'; href: string }
  | { kind: 'blocked'; href: string }
  | null;

/**
 * Schéma d'une URL, insensible à la casse et aux caractères de contrôle que les navigateurs
 * retirent avant résolution (`java&#10;script:` est un `javascript:` pour eux).
 */
const schemeOf = (href: string): string => {
  let compact = '';
  for (const character of href) {
    // Espaces et caracteres de controle (tabulation, saut de ligne, NUL...) : retires, comme
    // le fait le navigateur. Sans cela `java\nscript:` echapperait au test de schema.
    if (character.charCodeAt(0) > 0x20) compact += character;
    if (character === ':') break;
  }
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  return match ? (match[1] as string).toLowerCase() : '';
};

/**
 * Décide de l'action d'un clic à partir de sa cible. Pure : aucune navigation ici, l'appelant
 * l'exécute. Retourne `null` — et seulement dans ce cas — quand aucun `<a>` n'est concerné.
 */
export const resolveEmailLinkClick = (target: EventTarget | null): EmailLinkAction => {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return null;

  const anchor = element.closest('a');
  if (!anchor) return null;

  const href = (anchor.getAttribute('href') ?? '').trim();
  const scheme = schemeOf(href);

  if (scheme === 'http' || scheme === 'https') return { kind: 'external', href };
  if (scheme === 'mailto') return { kind: 'mailto', href };

  // Tout le reste — `javascript:`, `data:`, `file:`, `blob:`, ou un lien relatif qui
  // naviguerait à l'intérieur de l'application — est intercepté et ne fait rien.
  return { kind: 'blocked', href };
};
