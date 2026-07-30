import { enrichThinItemsWithPreview, selectSearchPreviewItems } from './search-preview-selector';
import { describe, expect, it } from 'vitest';

const preview = [{ id: 'p1' }, { id: 'p2' }];
const fallback = [{ id: 'f1' }];

describe('selectSearchPreviewItems — préview projection pendant le vol Gmail', () => {
  it('recherche en vol + préview non vide → la préview (résultats réels)', () => {
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: true,
        previewItems: preview,
        fallbackItems: fallback,
      }),
    ).toBe(preview);
  });

  it('littéral (« DHL ») : préview vide ou en vol → matches locaux seulement, jamais l’ancienne liste', () => {
    // Projection sans le fil (hors horizon de sync / correspondance corps) :
    // liste vide + bandeau, pas les résultats précédents sans rapport.
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: true,
        previewItems: [],
        fallbackItems: fallback,
        literalSearch: true,
      }),
    ).toEqual([]);
    // Préview pas encore arrivée : idem, pas de vue précédente.
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: true,
        previewItems: undefined,
        fallbackItems: fallback,
        literalSearch: true,
      }),
    ).toEqual([]);
    // Matches locaux présents : affichés (comportement inchangé).
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: true,
        previewItems: preview,
        fallbackItems: fallback,
        literalSearch: true,
      }),
    ).toBe(preview);
  });

  it('littéral : réponse authoritative arrivée → elle reprend la main', () => {
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: false,
        previewItems: [],
        fallbackItems: fallback,
        literalSearch: true,
      }),
    ).toBe(fallback);
  });

  it('préview vide (non littéral) → fallback (jamais de « aucun résultat » précoce)', () => {
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: true,
        previewItems: [],
        fallbackItems: fallback,
      }),
    ).toBe(fallback);
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: true,
        previewItems: undefined,
        fallbackItems: fallback,
      }),
    ).toBe(fallback);
  });

  it('réponse authoritative arrivée → elle reprend la main même si la préview existe', () => {
    expect(
      selectSearchPreviewItems({
        isSearching: true,
        authoritativeIsPlaceholder: false,
        previewItems: preview,
        fallbackItems: fallback,
      }),
    ).toBe(fallback);
  });

  it('hors recherche → fallback inconditionnel', () => {
    expect(
      selectSearchPreviewItems({
        isSearching: false,
        authoritativeIsPlaceholder: true,
        previewItems: preview,
        fallbackItems: fallback,
      }),
    ).toBe(fallback);
  });
});

describe('enrichThinItemsWithPreview — greffe des champs riches sur les lignes Gmail', () => {
  type Row = {
    id: string;
    historyId?: string | null;
    subject?: string;
    unread?: boolean;
  };
  const richP1: Row = { id: 'p1', historyId: null, subject: 'Relevé BDT', unread: true };

  it('ligne mince présente en préview → champs riches greffés, champs minces prioritaires', () => {
    const thin: Row = { id: 'p1', historyId: 'h42' };
    const [out] = enrichThinItemsWithPreview([thin], [richP1]);
    expect(out).toEqual({ id: 'p1', historyId: 'h42', subject: 'Relevé BDT', unread: true });
  });

  it('ligne mince hors préview → inchangée (fetch par ligne conservé)', () => {
    const thin: Row = { id: 'x9', historyId: 'h1' };
    expect(enrichThinItemsWithPreview([thin], [richP1])[0]).toBe(thin);
  });

  it('ligne déjà riche → jamais écrasée par la préview', () => {
    const rich: Row = { id: 'p1', historyId: 'h1', subject: 'Frais', unread: false };
    expect(enrichThinItemsWithPreview([rich], [richP1])[0]).toBe(rich);
  });

  it("préview absente ou vide → tableau d'origine par identité", () => {
    const items = [{ id: 'a', historyId: 'h' } as Row];
    expect(enrichThinItemsWithPreview(items, undefined)).toBe(items);
    expect(enrichThinItemsWithPreview(items, [])).toBe(items);
  });

  it("aucune greffe effectuée → tableau d'origine par identité (pas de re-render)", () => {
    const items = [{ id: 'z', historyId: 'h' } as Row];
    expect(enrichThinItemsWithPreview(items, [richP1])).toBe(items);
  });
});
