/**
 * Retrait chirurgical d'une ligne des caches de liste (CUA round 6, échec B).
 *
 * Après un « Delete draft » confirmé par Gmail, invalider la liste refetchait
 * la vérité Gmail encore RETARDÉE (le brouillon supprimé y figure quelques
 * secondes) : au retrait de l'action optimiste, la ligne réapparaissait. On
 * retire donc la ligne DIRECTEMENT des pages en cache — identifiant exact,
 * aucune autre ligne touchée — et la vérité canonique arrive ensuite par le
 * broadcast serveur du dossier draft.
 */
export interface ThreadListPage {
  threads?: { id: string }[];
}

export function pruneThreadFromListPages<T extends ThreadListPage>(
  data: { pages: T[] } | undefined,
  threadId: string,
): { pages: T[] } | undefined {
  if (!data?.pages) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.threads) return page;
    const threads = page.threads.filter((thread) => thread.id !== threadId);
    if (threads.length === page.threads.length) return page;
    changed = true;
    return { ...page, threads };
  });
  return changed ? { ...data, pages } : data;
}
