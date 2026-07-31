/**
 * Contrat de comportement de la requête de liste (partagé entre useThreads et
 * la chauffe des dossiers, prouvé par lib/mail-list-query.test.ts) :
 *
 * - snapshot d'abord : entrer dans un dossier peint TOUJOURS le cache local
 *   (par compte+dossier, persister IndexedDB par connexion) sans attendre le
 *   réseau ;
 * - réconciliation stale-only : `refetchOnMount: true` + staleTime ne relance
 *   UNE requête d'arrière-plan que si le snapshot a dépassé le staleTime — un
 *   dossier frais (< 5 min) ne déclenche RIEN (zéro requête redondante), et
 *   les rows restent affichées pendant le vol. C'est la garantie de fraîcheur
 *   du dossier COURANT, que le warmer périodique (voisins uniquement) ne
 *   couvre pas : entré à 6 min, on voit le snapshot immédiatement puis une
 *   seule réconciliation en fond (audit r6 — l'ancien refetchOnMount:false
 *   laissait un dossier ouvert périmé indéfiniment hors websocket).
 */
export const MAIL_LIST_STALE_MS = 5 * 60 * 1000;

export const MAIL_LIST_QUERY_BEHAVIOR = {
  staleTime: MAIL_LIST_STALE_MS,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  refetchIntervalInBackground: true,
} as const;
