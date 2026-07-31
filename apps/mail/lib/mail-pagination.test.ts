import {
  MAIL_LIST_PAGE_SIZE,
  mailListReserveRows,
  shouldExtendReaderPages,
  shouldLoadNextMailPage,
} from './mail-pagination';
import { describe, expect, it } from 'vitest';
import { FOLDERS } from '@/lib/utils';

describe('shouldLoadNextMailPage', () => {
  it('starts the next page a full server page before the loaded boundary', () => {
    expect(
      shouldLoadNextMailPage({
        remainingItems: 19,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);
  });

  it.each([
    { remainingItems: 20, isLoading: false, isFetchingNextPage: false, hasNextPage: true },
    { remainingItems: 2, isLoading: true, isFetchingNextPage: false, hasNextPage: true },
    { remainingItems: 2, isLoading: false, isFetchingNextPage: true, hasNextPage: true },
    { remainingItems: 2, isLoading: false, isFetchingNextPage: false, hasNextPage: false },
  ])('does not load for %o', (state) => {
    expect(shouldLoadNextMailPage(state)).toBe(false);
  });
});

describe('shouldExtendReaderPages', () => {
  it('extends the list when the reader nears the loaded boundary', () => {
    expect(
      shouldExtendReaderPages({
        index: 14,
        itemCount: 20,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);
    expect(
      shouldExtendReaderPages({
        index: 19,
        itemCount: 20,
        isFetchingNextPage: false,
        hasNextPage: true,
      }),
    ).toBe(true);
  });

  it.each([
    // Reader far from the boundary: no speculative page.
    { index: 3, itemCount: 20, isFetchingNextPage: false, hasNextPage: true },
    // Unresolved reader position (id absent and no usable focus hint).
    { index: -1, itemCount: 20, isFetchingNextPage: false, hasNextPage: true },
    // A page fetch is already in flight.
    { index: 19, itemCount: 20, isFetchingNextPage: true, hasNextPage: true },
    // Nothing left server-side.
    { index: 19, itemCount: 20, isFetchingNextPage: false, hasNextPage: false },
    // Empty list.
    { index: 0, itemCount: 0, isFetchingNextPage: false, hasNextPage: true },
  ])('does not extend for %o', (state) => {
    expect(shouldExtendReaderPages(state)).toBe(false);
  });
});

describe('mailListReserveRows — réserve par vue (r8 : gap de scroll perçu)', () => {
  const base = { isLoading: false, isFetchingNextPage: false, hasNextPage: true };

  it('projection : AUCUN fetch supplémentaire au premier paint (remaining 41 ≥ 35)', () => {
    const reserveRows = mailListReserveRows(FOLDERS.INBOX, false);
    expect(reserveRows).toBe(35);
    // Premier paint : 50 lignes chargées, viewport ~8 lignes → reste 41.
    // r8c : la page 2 ne part PAS sans interaction — cette requête de fond
    // concurrençait le clic immédiat vers Drafts (CUA r8b : p75 485 → 701 ms).
    const remainingAfterFirstPaint = MAIL_LIST_PAGE_SIZE - 1 - 8;
    expect(remainingAfterFirstPaint).toBe(41);
    expect(
      shouldLoadNextMailPage({ ...base, remainingItems: remainingAfterFirstPaint, reserveRows }),
    ).toBe(false);
  });

  it('projection : la page 2 part dès le PREMIER scroll (remaining 34 < 35)', () => {
    const reserveRows = mailListReserveRows(FOLDERS.INBOX, false);
    expect(shouldLoadNextMailPage({ ...base, remainingItems: 34, reserveRows })).toBe(true);
    // Le flick de 5 pages (~40 lignes) garde ainsi sa réserve : la page 2 est
    // en vol bien avant la frontière à 50. Une fois la réserve refaite,
    // le chaînage S'ARRÊTE (mémoire bornée à ~une page de 50 d'avance).
    expect(shouldLoadNextMailPage({ ...base, remainingItems: 91, reserveRows })).toBe(false);
  });

  it('recherche et Drafts : réserve historique de 20 — AUCUNE requête Gmail supplémentaire', () => {
    expect(mailListReserveRows(FOLDERS.INBOX, true)).toBe(20);
    expect(mailListReserveRows(FOLDERS.DRAFT, false)).toBe(20);
    // Une recherche avec 25 lignes de reste ne déclenche PAS de page 2 :
    // le comportement gagnant (666 ms vs 993 ms) n'est pas dégradé.
    expect(
      shouldLoadNextMailPage({
        ...base,
        remainingItems: 25,
        reserveRows: mailListReserveRows(FOLDERS.INBOX, true),
      }),
    ).toBe(false);
  });

  it('sans reserveRows explicite : seuil historique de 20 inchangé', () => {
    expect(shouldLoadNextMailPage({ ...base, remainingItems: 19 })).toBe(true);
    expect(shouldLoadNextMailPage({ ...base, remainingItems: 20 })).toBe(false);
  });
});
