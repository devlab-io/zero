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
