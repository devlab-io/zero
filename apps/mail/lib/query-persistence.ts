/**
 * Politique de rétention des corps persistés (explicite, r16) : une entrée
 * détail (fil complet ou corps rendu) jusqu'à 3 Mo — le mail ChatGPT de
 * 1,5 Mo est DANS la politique — et un budget total de 8 Mo servi par
 * fraîcheur décroissante (dataUpdatedAt) : les corps les plus récemment
 * lus/préchauffés survivent, les plus anciens sortent (LRU par récence de
 * donnée). Aucune croissance illimitée.
 */
export const DETAIL_QUERY_BUDGET_BYTES = 8 * 1024 * 1024;
export const SINGLE_DETAIL_QUERY_LIMIT_BYTES = 3 * 1024 * 1024;

/**
 * Durée de vie du cache persisté (restore au boot). r7b — cadrage honnête :
 * à 24 h, persistQueryClient jette le snapshot ENTIER (Drafts compris) dès
 * qu'un jour passe sans session — un cold boot multi-jour GARANTI, prouvé par
 * le test de restore réel ci-contre (snapshot de 25 h rejeté à 24 h, restauré
 * à 7 jours). C'est une CAUSE POSSIBLE du spinner Drafts observé au premier
 * clic post-reload (1 158 ms, CUA r7), pas une cause certaine : l'âge du
 * snapshot IndexedDB de ce run n'a pas été observé. Sept jours ÉLIMINENT
 * cette classe de cold boot ; la fraîcheur reste gouvernée par le contrat
 * stale-only à l'entrée de dossier (mail-list-query, 5 min) qui réconcilie
 * tout snapshot restauré en arrière-plan, la taille par les budgets ci-dessus
 * + le trim des pages au restore, et le shell neutre P0 est inchangé : le
 * restore ne démarre qu'après confirmation de l'identité
 * (query-provider.shell.test.tsx).
 */
export const QUERY_PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PersistableQuery = {
  queryKey: readonly unknown[];
  state: {
    data: unknown;
    dataUpdatedAt?: number;
    status: string;
  };
};

function getTRPCProcedurePath(queryKey: readonly unknown[]) {
  const path = queryKey[0];
  return Array.isArray(path) ? path.join('.') : '';
}

function getSerializedSize(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 0 : new Blob([serialized]).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Couture partagée : une requête « détail » (corps de mail rendu / fil complet).
 * Utilisée par les budgets ci-dessous ET par la scission du persister (r10). */
export function isDetailQuery(query: PersistableQuery) {
  return (
    query.queryKey[0] === 'email-content' || getTRPCProcedurePath(query.queryKey) === 'mail.get'
  );
}

export function shouldPersistQuery(query: PersistableQuery) {
  if (query.state.status !== 'success' || query.state.data == null) return false;

  if (getTRPCProcedurePath(query.queryKey) === 'mail.getMessageAttachments') return false;

  return (
    !isDetailQuery(query) || getSerializedSize(query.state.data) <= SINGLE_DETAIL_QUERY_LIMIT_BYTES
  );
}

export function selectQueriesForPersistence<T extends PersistableQuery>(queries: T[]) {
  let detailBytes = 0;

  return [...queries]
    .sort((left, right) => (right.state.dataUpdatedAt ?? 0) - (left.state.dataUpdatedAt ?? 0))
    .filter((query) => {
      if (!shouldPersistQuery(query)) return false;
      if (!isDetailQuery(query)) return true;

      const queryBytes = getSerializedSize(query.state.data);
      if (detailBytes + queryBytes > DETAIL_QUERY_BUDGET_BYTES) return false;

      detailBytes += queryBytes;
      return true;
    });
}
