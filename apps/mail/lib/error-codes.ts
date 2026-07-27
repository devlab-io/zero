/**
 * Lecture du code d'erreur stable publié par le serveur (`apps/server/src/lib/errors.ts`,
 * exposé par l'`errorFormatter` tRPC sous `data.appCode`).
 *
 * Avant cela, l'UI décidait de DÉCONNECTER l'utilisateur en comparant des messages à
 * travers la frontière réseau :
 *
 *     err.message === 'Required scopes missing' || err.message.includes('Invalid connection')
 *
 * Un libellé serveur reformulé cassait silencieusement la reconnexion ; une erreur non liée
 * dont le texte contenait la même sous-chaîne déconnectait à tort. Le code est désormais
 * une donnée machine, indépendante de la langue et du libellé.
 */

/** Codes serveur qui exigent une réautorisation OAuth (et donc un retour au login). */
export const REAUTHORIZATION_CODES = ['MISSING_SCOPES', 'CONNECTION_EXPIRED'] as const;

/**
 * Libellés historiques. PORTÉE EXACTE, mesurée : l'`errorFormatter` tRPC pose un `appCode`
 * sur CHAQUE erreur de procédure, donc ce repli est INATTEIGNABLE pour une erreur tRPC. Il
 * ne couvre que les erreurs qui n'en viennent pas — appels `authClient` de better-auth,
 * `fetch` direct — et qui n'exposent donc aucun code.
 *
 * Ce n'est PAS le filet de sécurité du parcours de reconnexion : une connexion sans jetons
 * remontait `appCode: INTERNAL` avec « Invalid connection … » dans le message, forme que ce
 * repli ne pouvait pas rattraper sans déconnecter aussi toute erreur non liée portant la
 * même sous-chaîne. Cela se corrige côté serveur, et c'est fait : le verdict typé du
 * Durable Object publie désormais `CONNECTION_EXPIRED` (apps/server/src/lib/reconnect-path.test.ts).
 */
const LEGACY_REAUTHORIZATION_MESSAGES = ['Required scopes missing', 'Invalid connection'];

function readAppCode(container: unknown): string | null {
  if (typeof container !== 'object' || container === null) return null;
  const code = (container as { appCode?: unknown }).appCode;
  return typeof code === 'string' ? code : null;
}

/** Extrait `appCode` d'une erreur tRPC, que le client l'expose sur `data` ou sur `shape.data`. */
export function extractAppCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const direct = readAppCode((error as { data?: unknown }).data);
  if (direct) return direct;
  const shape = (error as { shape?: unknown }).shape;
  if (typeof shape === 'object' && shape !== null) {
    return readAppCode((shape as { data?: unknown }).data);
  }
  return null;
}

/**
 * `true` si l'erreur signale un octroi OAuth inutilisable (scopes manquants, connexion
 * expirée) — le seul cas où l'UI a le droit de couper la session.
 */
export function requiresReauthorization(error: unknown): boolean {
  const code = extractAppCode(error);
  if (code) return (REAUTHORIZATION_CODES as readonly string[]).includes(code);

  const message = (error as { message?: unknown })?.message;
  if (typeof message !== 'string') return false;
  return LEGACY_REAUTHORIZATION_MESSAGES.some((legacy) => message.includes(legacy));
}
