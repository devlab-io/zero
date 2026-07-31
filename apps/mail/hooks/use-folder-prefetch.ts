import { mailListMaxResults } from '@/lib/mail-pagination';
import { MAIL_LIST_STALE_MS } from '@/lib/mail-list-query';
import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { useCallback, useEffect } from 'react';
import { FOLDERS } from '@/lib/utils';

const FOLDER_LIST_STALE_MS = MAIL_LIST_STALE_MS;

/**
 * Cadence de re-chauffe des dossiers VOISINS. Chaque cycle est un no-op réseau
 * tant que le cache est frais (prefetchInfiniteQuery déduplique) et re-tente
 * un échec précédent au cycle suivant. Ce n'est PAS une garantie « toujours
 * < 5 min » : selon la phase intervalle/staleTime, un snapshot voisin peut
 * atteindre ~9 min (et davantage sur cold/erreur répétée) — c'est le rôle de
 * la réconciliation stale-only à l'ENTRÉE du dossier (MAIL_LIST_QUERY_BEHAVIOR)
 * de rattraper la fraîcheur ; le warmer, lui, garantit qu'un clic dossier a un
 * snapshot local à peindre immédiatement (cible r6 : Inbox→Drafts 3275 ms vs
 * Shortwave 1446 ms — chaud, le paint est un cache-hit).
 */
export const FOLDER_REWARM_INTERVAL_MS = 4 * 60 * 1000;

export const CORE_MAIL_FOLDER_PREFETCH_ORDER = [
  FOLDERS.INBOX,
  FOLDERS.BIN,
  FOLDERS.SENT,
  FOLDERS.ARCHIVE,
  FOLDERS.SNOOZED,
  FOLDERS.SPAM,
  FOLDERS.DRAFT,
] as const;

export function mailFolderFromHref(href: string): string | null {
  const match = /^\/mail\/([^/?#]+)/.exec(href);
  return match?.[1] ?? null;
}

export type WarmFolderTargets = {
  /** Dossiers projection (DO, bon marché) — chauffés ensemble immédiatement. */
  projection: string[];
  /** Drafts (Gmail live, lent) — chauffé au macrotask suivant, hors du batch. */
  deferred: string[];
};

/**
 * Cibles de chauffe depuis le dossier courant : tous les voisins de la
 * sidebar SAUF celui affiché (sa liste est déjà la requête active — la
 * re-demander serait la requête redondante par excellence).
 */
export function selectWarmFolderTargets(currentFolder: string): WarmFolderTargets {
  const neighbours = CORE_MAIL_FOLDER_PREFETCH_ORDER.filter((folder) => folder !== currentFolder);
  return {
    projection: neighbours.filter((folder) => folder !== FOLDERS.DRAFT),
    deferred: neighbours.filter((folder) => folder === FOLDERS.DRAFT),
  };
}

export function usePrefetchMailFolder() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useCallback(
    (folder: string) =>
      queryClient.prefetchInfiniteQuery(
        trpc.mail.listThreads.infiniteQueryOptions(
          // MÊME input que useThreads (q vide, labels vides, taille de page
          // par dossier) : une clé divergente rendrait la chauffe invisible
          // pour la liste.
          { q: '', folder, labelIds: [], maxResults: mailListMaxResults(folder, false) },
          {
            initialCursor: '',
            getNextPageParam: (lastPage) => lastPage?.nextPageToken ?? null,
            staleTime: FOLDER_LIST_STALE_MS,
          },
        ),
      ),
    [queryClient, trpc],
  );
}

/**
 * Warm every sidebar destination without delaying the current folder, from ANY
 * folder (pas seulement l'Inbox : Drafts→Sent doit rester chaud aussi), et
 * re-chauffe périodiquement sous le staleTime — voir FOLDER_REWARM_INTERVAL_MS.
 * Au changement de compte, le QueryProvider swappe QueryClient + persister
 * (cache par user+connexion) : ce hook repart alors sur le client neuf, donc
 * chauffe les dossiers du compte ACTIF uniquement — aucune fuite croisée.
 */
export function useWarmCoreMailFolders(enabled: boolean, currentFolder: string) {
  const prefetchFolder = usePrefetchMailFolder();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let deferredTimerId: number | null = null;
    const warm = () => {
      const targets = selectWarmFolderTargets(currentFolder);
      // Projection-backed folders are cheap and must all be hot before a rapid
      // sidebar sequence. Start them together immediately; the server resolves
      // the batch in one DO wake-up. Draft fans a Gmail list call out into
      // detail reads, so start it in the next macrotask and never put that
      // slower path on the projection batch's response path. (La page Queue
      // n'est PAS chauffée ici — contre-revue r6 : trafic périodique inutile.)
      void Promise.all(
        targets.projection.map((folder) => prefetchFolder(folder).catch(() => undefined)),
      );
      if (targets.deferred.length > 0) {
        deferredTimerId = window.setTimeout(() => {
          deferredTimerId = null;
          for (const folder of targets.deferred) {
            void prefetchFolder(folder).catch(() => undefined);
          }
        }, 0);
      }
    };

    warm();
    const intervalId = window.setInterval(warm, FOLDER_REWARM_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      if (deferredTimerId !== null) window.clearTimeout(deferredTimerId);
    };
  }, [currentFolder, enabled, prefetchFolder]);
}
