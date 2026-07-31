/**
 * Amorçage de la résolution de session au PARSE du HTML (r9, cold boot).
 *
 * Waterfall mesuré (CUA prod : reload authentifié p75 2150 ms vs Shortwave
 * 1111) : la requête /api/auth/get-session ne partait qu'au clientLoader,
 * c'est-à-dire APRÈS téléchargement + parse + hydratation du bundle — la RTT
 * session (~500-900 ms) était SÉRIALISÉE derrière le JS. Un script inline dans
 * le <head> prérendu lance ce fetch dès le parse du HTML : la RTT session
 * recouvre alors le chargement du bundle au lieu de le suivre.
 *
 * Contrat P0 intact : l'amorce ne fait que démarrer le MÊME aller-retour
 * réseau plus tôt (cookies du navigateur, aucune donnée du hint owner) ; le
 * shell neutre, la confirmation d'identité et la restauration owner-scopée
 * sont inchangés — seule la date de départ de la requête change. L'amorce est
 * one-shot (consommée ou invalidée au premier get-session, purgée au logout
 * via invalidateGetSessionDedup) et expire après SESSION_PRIME_TTL_MS.
 */

export const SESSION_PRIME_TTL_MS = 5_000;

export type SessionPrime = {
  at: number;
  promise: Promise<Response | null>;
};

declare global {
  interface Window {
    __zeroSessionPrime?: SessionPrime;
  }
}

/**
 * Snippet inline injecté dans le <head> (root.tsx). Pose le jalon
 * `zero:boot:session-prime` (même préfixe que markStage) et lance le fetch
 * get-session avec les cookies — un échec réseau résout à null, le vrai
 * appelant refera alors sa propre requête.
 */
export function buildSessionPrimeSnippet(backendUrl: string): string {
  const url = `${backendUrl.replace(/\/$/, '')}/api/auth/get-session`;
  // L'URL est une constante de build (VITE_PUBLIC_BACKEND_URL), jamais une
  // entrée utilisateur. Défense en profondeur tout de même : JSON.stringify
  // échappe les quotes, et `<` est échappé en < pour qu'aucune valeur ne
  // puisse fermer la balise <script> (séquence `</script>`).
  const serializedUrl = JSON.stringify(url).replace(/</g, '\\u003c');
  return (
    `try{performance.mark('zero:boot:session-prime');` +
    `window.__zeroSessionPrime={at:Date.now(),promise:fetch(${serializedUrl},{credentials:'include'}).catch(function(){return null})}}` +
    `catch(e){}`
  );
}

/**
 * Consomme l'amorce UNE seule fois. Fraîche → sa promesse ; absente, déjà
 * consommée ou périmée (> TTL : bfcache, onglet resté ouvert) → null et le
 * caller fait sa requête normale. La one-shot garantit qu'aucune réponse
 * amorcée avant un logout ne peut resservir après.
 */
export function consumeSessionPrime(now: number = Date.now()): Promise<Response | null> | null {
  if (typeof window === 'undefined') return null;
  const prime = window.__zeroSessionPrime;
  if (!prime) return null;
  delete window.__zeroSessionPrime;
  if (now - prime.at >= SESSION_PRIME_TTL_MS) return null;
  return prime.promise;
}

/** Purge explicite (logout) : une amorce jamais consommée ne doit pas survivre. */
export function clearSessionPrime(): void {
  if (typeof window === 'undefined') return;
  delete window.__zeroSessionPrime;
}
