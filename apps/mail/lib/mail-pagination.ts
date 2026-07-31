import { FOLDERS } from '@/lib/utils';

interface MailPaginationState {
  remainingItems: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  /** Réserve de lignes à maintenir sous le viewport (défaut historique : 20). */
  reserveRows?: number;
}

/**
 * Projection list page size. The deep-scroll cost is round-trip SERIALIZATION:
 * each next page is a full client→edge→DO trip that only starts near the
 * loaded boundary (CUA r6: 5 viewport pages = 1545 ms vs Shortwave 1246 ms,
 * ≈4 serialized 20-row fetches). The DO projection is already sized for 50
 * (its own default, and the #30 payload budget test measures 50 rows at
 * 1.3 KiB gzip), so 50-row pages halve the trips a deep scroll serializes.
 * Search stays on the server default (20): Gmail `q` pages are expensive.
 */
export const MAIL_LIST_PAGE_SIZE = 50;

/**
 * Taille de page effective pour un dossier donné. Seul le chemin projection DO
 * (dossiers hors recherche, hors Drafts) passe à 50 : la recherche paie des
 * pages Gmail `q` chères, et Drafts est servi par `listDrafts` (Gmail live,
 * fan-out possible en lectures de détail) — l'y appliquer aurait EMPIRÉ les
 * 3 275 ms mesurés. `undefined` laisse le défaut serveur (20).
 * Utilisé par la liste ET la chauffe des dossiers : même input → même clé de
 * requête, sinon la chauffe serait invisible pour la liste.
 */
export function mailListMaxResults(
  folder: string | undefined,
  isSearching: boolean,
): number | undefined {
  if (isSearching || folder === FOLDERS.DRAFT) return undefined;
  return MAIL_LIST_PAGE_SIZE;
}

/**
 * Réserve à maintenir sous le viewport, par type de vue (r8 — gap de scroll
 * perçu : CUA action 1000 ms vs Shortwave 159 ms). Avec des pages projection
 * de 50 et une réserve de 20, un flick de 5 pages (~40 lignes) atteignait la
 * frontière chargée AVANT que la page 2 n'atterrisse → blanc pendant le RTT,
 * c'est l'« action » mesurée.
 *
 * r8c : 35, PAS 45. À 45, la page 2 partait dès le premier paint (remaining
 * 50-1-~8 ≈ 41 < 45) et cette requête projection de fond concurrençait le
 * clic immédiat vers un autre dossier — CUA staging r8b : Drafts p75 dégradé
 * de 485 à 701 ms (premières mesures 466-480, puis 664-712 une fois la
 * page 2 en vol). À 35 : AUCUN fetch au premier paint (41 ≥ 35), départ dès
 * le PREMIER scroll (remaining ≤ 34) — le flick de 5 pages (~40 lignes,
 * frontière à 50) garde sa réserve, l'idle au paint reste vierge pour la
 * navigation. La recherche et Drafts (pages de 20, requêtes Gmail chères —
 * chemins déjà gagnants) gardent la réserve historique de 20 : AUCUNE
 * requête supplémentaire n'y est admise.
 */
export function mailListReserveRows(folder: string | undefined, isSearching: boolean): number {
  return mailListMaxResults(folder, isSearching) === MAIL_LIST_PAGE_SIZE ? 35 : 20;
}

/**
 * Page-list readiness only. Thread-body prefetches are intentionally absent:
 * reading or warming adjacent messages must never block infinite scrolling.
 * Chained re-checks after each append stop as soon as the reserve is met,
 * which bounds memory (projection : ~une page de 50 d'avance, pas plus).
 */
export function shouldLoadNextMailPage({
  remainingItems,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  reserveRows = 20,
}: MailPaginationState) {
  return remainingItems < reserveRows && !isLoading && !isFetchingNextPage && hasNextPage;
}

interface ReaderPaginationState {
  index: number;
  itemCount: number;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

/** Rows left below the open thread before ArrowDown/j hits the loaded boundary. */
const READER_EXTEND_THRESHOLD = 5;

/**
 * The reader must extend the list itself: while a thread is open the list does
 * not scroll, so the scroll-driven pagination never fires and ArrowDown/j used
 * to hit a wall near the end of the loaded pages. Extending early also gives
 * the adjacent-thread prefetch real targets deep in the inbox.
 */
export function shouldExtendReaderPages({
  index,
  itemCount,
  isFetchingNextPage,
  hasNextPage,
}: ReaderPaginationState) {
  return (
    index >= 0 &&
    itemCount > 0 &&
    itemCount - 1 - index <= READER_EXTEND_THRESHOLD &&
    !isFetchingNextPage &&
    hasNextPage
  );
}
