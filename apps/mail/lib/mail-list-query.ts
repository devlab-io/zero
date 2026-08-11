import { FOLDERS } from '@/lib/utils';

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
 *   première réconciliation en fond (audit r6 — l'ancien refetchOnMount:false
 *   laissait un dossier ouvert périmé indéfiniment) ;
 * - changements externes : focus immédiat et sondage visible borné à 60 s,
 *   notamment pour les réponses envoyées depuis Shortwave ou Gmail.
 */
export const MAIL_LIST_STALE_MS = 5 * 60 * 1000;
export const MAIL_LIST_RECONCILE_MS = 60 * 1000;

export const MAIL_LIST_QUERY_BEHAVIOR = {
  staleTime: MAIL_LIST_STALE_MS,
  refetchOnMount: true,
  // Messages can be sent or received from Shortwave/Gmail while RETA remains
  // open. Returning to the tab must therefore reconcile immediately; a visible
  // mailbox also catches up within one minute without relying on the removed
  // legacy mail websocket.
  refetchOnWindowFocus: 'always' as const,
  refetchInterval: MAIL_LIST_RECONCILE_MS,
  refetchIntervalInBackground: false,
} as const;

/**
 * Drafts are provider-owned mutable resources: sending a Gmail draft removes
 * it from the provider collection. Unlike projected folders, a persisted
 * draft snapshot must therefore be reconciled every time the view is mounted
 * or an old tab regains focus. This is intentionally scoped to Drafts so the
 * normal snapshot-first performance contract stays unchanged elsewhere.
 */
export const mailListQueryBehaviorForFolder = (folder?: string) => ({
  ...MAIL_LIST_QUERY_BEHAVIOR,
  refetchOnMount: folder === FOLDERS.DRAFT ? ('always' as const) : true,
  refetchOnWindowFocus: 'always' as const,
});
