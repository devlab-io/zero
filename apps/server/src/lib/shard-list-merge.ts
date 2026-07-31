/**
 * Fusion paginée multi-shard de la liste de fils (audit r8, P0).
 *
 * L'ancienne agrégation concaténait les pages de shards SANS tri global et
 * faisait dériver la continuation du token d'UN seul shard — passé ensuite à
 * TOUS les shards : omissions, doublons et désordre garantis en deep scroll
 * multi-shard. Ici :
 *   - merge global trié par récence (receivedOn desc), dédupliqué par id ;
 *   - curseur COMPOSITE par shard : chaque shard garde son propre token et un
 *     offset `skip` dans la page re-requêtable (consommation partielle) ;
 *   - continuation EXACTE quand le total atteint pile la limite : le token
 *     suivant n'est null que si TOUS les shards sont épuisés.
 *
 * Tout est pur et déterministe — l'orchestration DO (server-utils) ne fait
 * que requêter chaque shard avec SON token et brancher ce module.
 */

export type MergeableThreadRow = {
  id: string;
  receivedOn?: string;
};

export type ShardListPage<T extends MergeableThreadRow> = {
  shardId: string;
  threads: T[];
  nextPageToken: string | null;
};

export type ShardCursorEntry = {
  /** Token à passer au shard pour (re)obtenir sa page courante ; null = première page. */
  token: string | null;
  /** Lignes de cette page déjà consommées par les pages fusionnées précédentes. */
  skip: number;
  /** Shard épuisé : ne plus le requêter, ne jamais repartir de sa première page. */
  done?: boolean;
};

export type CompositeShardCursor = {
  shards: Record<string, ShardCursorEntry>;
  /**
   * Ids déjà servis par les pages globales précédentes (r8b). Rien ne prouve
   * qu'un fil ne vit que dans UN shard : une copie plus ancienne du même id
   * peut émerger d'un autre shard plusieurs pages plus tard — sans cet état,
   * elle serait resservie. FIFO borné par SERVED_IDS_CAP (voir sa doc).
   */
  served: string[];
};

/**
 * Borne explicite de l'état de dédup porté par le curseur : 1000 ids servis,
 * soit ~20 pages globales de 50 — bien au-delà de la profondeur de scroll
 * réellement supportée côté client (le restore persiste 3 pages ; le deep
 * scroll CUA en couvre 5). Au-delà, les ids servis les PLUS ANCIENS sont
 * élagués en premier (FIFO) : la fenêtre de dédup reste collée à la frontière
 * courante, seuls les ids des toutes premières pages redeviennent — en
 * théorie — resservables passé ce cap. Taille de token bornée (~17 Ko pire
 * cas), jamais dans une URL (POST tRPC + cache client uniquement).
 */
export const SERVED_IDS_CAP = 1000;

/** Préfixe d'enveloppe : tout autre pageToken est un token legacy mono-shard. */
const COMPOSITE_CURSOR_PREFIX = 'msc1:';

export function encodeCompositeShardCursor(cursor: CompositeShardCursor): string {
  return `${COMPOSITE_CURSOR_PREFIX}${Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')}`;
}

/**
 * null = pas un curseur composite (token legacy à passer tel quel aux shards,
 * comportement historique préservé pour les clients en vol au déploiement).
 */
export function decodeCompositeShardCursor(pageToken?: string): CompositeShardCursor | null {
  if (!pageToken || !pageToken.startsWith(COMPOSITE_CURSOR_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(pageToken.slice(COMPOSITE_CURSOR_PREFIX.length), 'base64url').toString('utf8'),
    ) as CompositeShardCursor;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.shards !== 'object') return null;
    return { shards: parsed.shards, served: Array.isArray(parsed.served) ? parsed.served : [] };
  } catch {
    return null;
  }
}

const recencyOf = (row: MergeableThreadRow): number => {
  if (!row.receivedOn) return 0;
  const parsed = Date.parse(row.receivedOn);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export type MergedShardList<T extends MergeableThreadRow> = {
  threads: T[];
  nextPageToken: string | null;
};

/**
 * Fusionne les pages de shards en une page globale triée/dédupliquée et
 * construit le curseur composite de continuation.
 *
 * @param pages    Page courante de chaque shard interrogé (déjà décalée de
 *                 rien : le `skip` du curseur précédent est appliqué ICI).
 * @param maxResults Taille de page globale.
 * @param previous Curseur composite de la page précédente (null en page 1).
 */
export function mergeShardListPages<T extends MergeableThreadRow>(
  pages: ShardListPage<T>[],
  maxResults: number,
  previous: CompositeShardCursor | null,
): MergedShardList<T> {
  type ShardState = {
    shardId: string;
    rows: T[];
    index: number;
    consumed: number;
    priorSkip: number;
    token: string | null;
    nextPageToken: string | null;
  };

  const states: ShardState[] = pages.map((page) => {
    const prior = previous?.shards[page.shardId];
    const priorSkip = prior?.skip ?? 0;
    return {
      shardId: page.shardId,
      // Consommation partielle : la page re-requêtée du shard est identique,
      // les `skip` premières lignes ont déjà été servies.
      rows: page.threads.slice(priorSkip),
      index: 0,
      consumed: 0,
      priorSkip,
      token: prior?.token ?? null,
      nextPageToken: page.nextPageToken,
    };
  });

  const merged: T[] = [];
  // r8b : la dédup couvre AUSSI les pages globales précédentes — une copie
  // plus ancienne du même id émergeant d'un autre shard des pages plus tard
  // est consommée de son flux sans jamais être resservie.
  const seenIds = new Set<string>(previous?.served ?? []);

  while (merged.length < maxResults) {
    let best: ShardState | null = null;
    for (const state of states) {
      if (state.index >= state.rows.length) continue;
      if (!best) {
        best = state;
        continue;
      }
      const candidate = state.rows[state.index] as T;
      const current = best.rows[best.index] as T;
      const byRecency = recencyOf(candidate) - recencyOf(current);
      // Récence décroissante ; à égalité, ordre stable par shardId pour un
      // découpage de pages déterministe entre deux requêtes.
      if (byRecency > 0 || (byRecency === 0 && state.shardId < best.shardId)) {
        best = state;
      }
    }
    if (!best) break;

    const row = best.rows[best.index] as T;
    best.index += 1;
    best.consumed += 1;
    // Doublon inter-shard : la ligne est CONSOMMÉE de son flux (jamais resservie)
    // mais n'occupe pas de place dans la page globale.
    if (seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    merged.push(row);
  }

  const nextShards: Record<string, ShardCursorEntry> = {};
  let anyRemaining = false;
  for (const state of states) {
    const remainingInPage = state.rows.length - state.index;
    if (remainingInPage > 0) {
      // Page partiellement consommée : même token, skip avancé.
      nextShards[state.shardId] = {
        token: state.token,
        skip: state.priorSkip + state.consumed,
      };
      anyRemaining = true;
    } else if (state.nextPageToken) {
      // Page épuisée, le shard a une suite : son token enfant est CONSERVÉ.
      nextShards[state.shardId] = { token: state.nextPageToken, skip: 0 };
      anyRemaining = true;
    } else {
      // Shard épuisé : marqué done pour ne jamais repartir de sa page 1.
      nextShards[state.shardId] = { token: null, skip: 0, done: true };
    }
  }

  // État de dédup inter-pages : ids déjà servis + ceux de cette page, FIFO
  // borné — les plus anciens servis sont élagués en premier (voir SERVED_IDS_CAP).
  const served = [...(previous?.served ?? []), ...merged.map((row) => row.id)].slice(
    -SERVED_IDS_CAP,
  );

  // Continuation exacte : même quand merged.length === maxResults pile, le
  // token n'est null que si plus AUCUN shard n'a de reste.
  return {
    threads: merged,
    nextPageToken: anyRemaining ? encodeCompositeShardCursor({ shards: nextShards, served }) : null,
  };
}
