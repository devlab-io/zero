import { setActiveConnectionId } from './active-connection-store';

const CACHE_OWNER_HINT_KEY = 'zero-cache-owner-hint';

/**
 * Devlab (perf) : pendant que useSession() résout (1,2 à 2,5 s mesurés sur
 * staging), QueryProvider calculait un cacheOwner "anonymous-<connectionId>"
 * puis basculait vers le vrai user id une fois la session résolue — ce
 * changement de clé recrée un QueryClient et un persister IndexedDB neufs
 * (getQueryClient), donc jette toute la première vague de requêtes qui repart
 * ensuite (régime établi 2,7 s, dont cette seconde vague). Ce hint garde le
 * dernier cacheOwner connu en localStorage pour l'utiliser dès le rendu
 * initial, tant qu'il correspond au connectionId courant.
 */

/**
 * Résolution PURE de l'identité du cache (QueryClient + persister IndexedDB) :
 * `user-connexion`. Règle P0 (audit r6) : tant que la session n'a pas CONFIRMÉ
 * l'utilisateur, l'identité est anonyme — le hint localStorage n'est JAMAIS
 * consulté, car il n'est pas vérifiable côté client (crash navigateur, vieux
 * build ou storage périmé peuvent le laisser en place sans passer par
 * signOut ; la purge au logout est une hygiène nécessaire, PAS une preuve).
 * Une identité anonyme ne correspond à aucun persister user-scopé : rien d'un
 * ancien compte ne peut être restauré ni peint avant confirmation. Dès que la
 * session résout, l'identité stricte user-connexion sélectionne le cache
 * chaud du compte — même identité → cache conservé, autre identité → autre
 * persister, jamais celui d'un tiers.
 */
export function resolveCacheOwner(input: {
  sessionUserId: string | null | undefined;
  isSessionPending: boolean;
  connectionId: string | null;
  /** Ignoré tant que la session n'est pas résolue — conservé dans la signature
   * pour que les tests prouvent qu'un hint injecté n'a AUCUN effet. */
  hint: string | null;
}): string {
  if (input.isSessionPending || !input.sessionUserId) {
    return `anonymous-${input.connectionId ?? 'default'}`;
  }
  return `${input.sessionUserId}-${input.connectionId ?? 'default'}`;
}

export function readCacheOwnerHint(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CACHE_OWNER_HINT_KEY);
  } catch {
    // Safari navigation privée / quota localStorage plein : le hint est un
    // confort d'affichage, pas une nécessité fonctionnelle.
    return null;
  }
}

export function writeCacheOwnerHint(owner: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_OWNER_HINT_KEY, owner);
  } catch {
    // idem
  }
}

export function clearCacheOwnerHint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_OWNER_HINT_KEY);
  } catch {
    // idem
  }
}

/**
 * Purge ATOMIQUE des hints d'identité client (cacheOwner legacy + connexion
 * active), appelée par le wrapper signOut sur CHAQUE chemin de déconnexion
 * (menu utilisateur, error boundary de root.tsx, signout forcé du QueryCache).
 * HYGIÈNE, pas preuve : la garantie zéro-fuite ne repose pas sur elle mais sur
 * resolveCacheOwner, qui refuse toute identité user-scopée avant confirmation
 * de session — même si un hint périmé survit (crash, vieux build).
 */
export function purgeClientIdentityHints(): void {
  clearCacheOwnerHint();
  setActiveConnectionId(null);
}
