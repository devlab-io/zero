import { foldSearchText } from './search-fold';

/**
 * Sélection d'affichage de la préview de recherche projection-first
 * (CUA 2026-07-30, obs 3 — « premier résultat <1 s »).
 *
 * Pendant qu'une recherche est en vol, la query infinie (`keepPreviousData`)
 * expose encore les lignes de la vue PRÉCÉDENTE (placeholder). Si la préview
 * projection (DO, sujet/expéditeur) a déjà répondu avec des correspondances,
 * on affiche CELLES-CI — des résultats réels de la recherche — plutôt que la
 * vue précédente. Dès que la réponse authoritative (Gmail `q`) atterrit,
 * `authoritativeIsPlaceholder` repasse à false et elle reprend l'affichage.
 *
 * Préview vide → fallback : on ne rend JAMAIS un « aucun résultat » précoce
 * sur la seule foi de la projection (elle ne couvre pas le corps des messages).
 */
/**
 * Une fois la réponse Gmail atterrie, ses lignes sont MINCES (`id`/`historyId`
 * seulement) : chaque ligne re-fetche son corps (`mail.get`) pour afficher
 * sujet/expéditeur. Pour les fils que la préview projection avait déjà servis,
 * on greffe ses champs riches (sujet, expéditeur, date, labels, unread) sur la
 * ligne Gmail — l'ordre et la composition restent ceux de Gmail (authoritatif),
 * seuls les champs d'affichage déjà connus sont réutilisés. Les lignes hors
 * préview (correspondance dans le corps du message) restent minces et gardent
 * le comportement actuel.
 */
export function enrichThinItemsWithPreview<T extends { id: string; unread?: boolean }>(
  items: T[],
  previewItems: T[] | undefined,
): T[] {
  if (!previewItems || previewItems.length === 0) return items;
  const richById = new Map(previewItems.map((item) => [item.id, item]));
  let changed = false;
  const enriched = items.map((item) => {
    if (item.unread !== undefined) return item; // déjà riche (projection)
    const rich = richById.get(item.id);
    if (!rich) return item;
    changed = true;
    // La ligne mince garde la priorité champ à champ (id, historyId réel) ; la
    // préview ne fournit que ce que la ligne mince n'a pas (affichage).
    return { ...rich, ...item };
  });
  return changed ? enriched : items;
}

/**
 * Fusion locale-d'abord d'une recherche LITTÉRALE une fois la réponse Gmail
 * atterrie (CUA 2026-07-31 : Kura/Restaurant « empty », LIQUID STUDIO faux
 * positif). La réponse Gmail remplaçait intégralement la préview projection :
 * une page Gmail vide ou divergente effaçait des correspondances exactes
 * sujet/expéditeur pourtant présentes dans la projection locale.
 *
 * Contrat : les matches locaux (préview projection, ordre date desc du DO)
 * restent affichés en tête et gardent leurs positions du vol — Gmail ne peut
 * qu'ENRICHIR (champs réels id/historyId des lignes qu'il confirme) et
 * COMPLÉTER (ses matches hors projection — corps de message, autres dossiers —
 * ajoutés après, dédupliqués par threadId). Il ne remplace jamais un exact
 * local par un autre résultat.
 */
export function mergeAuthoritativeWithLocalMatches<T extends { id: string; unread?: boolean }>(
  authoritativeItems: T[],
  previewItems: T[] | undefined,
): T[] {
  if (!previewItems || previewItems.length === 0) return authoritativeItems;

  const authoritativeById = new Map(authoritativeItems.map((item) => [item.id, item]));
  const previewIds = new Set(previewItems.map((item) => item.id));

  // Tête : les matches locaux, dans l'ordre où la préview les a affichés ; une
  // ligne confirmée par Gmail récupère ses champs authoritatifs (id, historyId)
  // par-dessus les champs d'affichage déjà servis.
  const head = previewItems.map((item) => {
    const confirmed = authoritativeById.get(item.id);
    return confirmed ? { ...item, ...confirmed } : item;
  });

  // Queue : les matches Gmail hors projection (corps de message, hors dossier),
  // enrichis si possible — dédupliqués contre la tête.
  const tail = enrichThinItemsWithPreview(
    authoritativeItems.filter((item) => !previewIds.has(item.id)),
    previewItems,
  );

  return tail.length === 0 ? head : [...head, ...tail];
}

type LiteralSearchPreviewItem = {
  subject?: string | null;
  sender?: { name?: string | null; email?: string | null } | null;
};

/**
 * Return only real subject/sender matches from the list page already in memory.
 * This is the zero-round-trip first paint for a literal search; the projection
 * and Gmail queries still replace/complete it as soon as they resolve.
 * Matching is accent/case/whitespace-folded (search-fold), same semantics as
 * the DO projection LIKE.
 */
export function filterLiteralSearchPreviewItems<T extends LiteralSearchPreviewItem>(
  items: T[],
  query: string,
): T[] {
  const trimmed = query.trim();
  const quoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith('«') && trimmed.endsWith('»')));
  const needle = foldSearchText(quoted ? trimmed.slice(1, -1) : trimmed);
  if (!needle) return [];

  return items.filter((item) =>
    [item.subject, item.sender?.name, item.sender?.email]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => foldSearchText(value).includes(needle)),
  );
}

export function selectSearchPreviewItems<T>(params: {
  /** Une recherche (q non vide) est active. */
  isSearching: boolean;
  /** La query authoritative n'a pour cette clé que du placeholder (vol en cours). */
  authoritativeIsPlaceholder: boolean;
  /** Lignes renvoyées par la préview projection, si déjà arrivées. */
  previewItems: T[] | undefined;
  /** Lignes actuellement affichables (vue précédente tenue par keepPreviousData). */
  fallbackItems: T[];
  /**
   * La requête est une phrase littérale simple (isSimpleLiteralSearch) : la
   * préview projection est alors LA vue pertinente pendant le vol Gmail.
   * CUA 2026-07-30 (échec « DHL ») : quand la projection n'a pas le fil (hors
   * horizon de sync, correspondance corps de message), l'ancien fallback
   * laissait la vue PRÉCÉDENTE — des résultats sans rapport lus comme des
   * résultats de recherche — à l'écran pendant ~5 s. En littéral, on n'affiche
   * QUE les matches locaux (même zéro, bandeau « Searching » visible), jamais
   * l'ancienne liste. Les requêtes à opérateurs/IA gardent le fallback (la
   * préview y est un sentinel vide, pas une réponse).
   */
  literalSearch?: boolean;
}): T[] {
  const { isSearching, authoritativeIsPlaceholder, previewItems, fallbackItems, literalSearch } =
    params;
  if (!isSearching || !authoritativeIsPlaceholder) return fallbackItems;
  if (previewItems && previewItems.length > 0) return previewItems;
  if (literalSearch) return previewItems ?? [];
  return fallbackItems;
}
