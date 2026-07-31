import {
  enrichThinItemsWithPreview,
  filterLiteralSearchPreviewItems,
  mergeAuthoritativeWithLocalMatches,
  selectSearchPreviewItems,
} from './search-preview-selector';
import { describe, expect, it } from 'vitest';

const preview = [{ id: 'p1' }, { id: 'p2' }];
const fallback = [{ id: 'f1' }];

describe('filterLiteralSearchPreviewItems — premier paint sans réseau', () => {
  const rows = [
    {
      id: 'dhl-subject',
      subject: 'DHL On Demand Delivery',
      sender: { name: 'Notifications', email: 'noreply@example.com' },
    },
    {
      id: 'dhl-sender',
      subject: 'Shipment update',
      sender: { name: 'DHL Express', email: 'support@dhl.com' },
    },
    {
      id: 'other',
      subject: 'Invoice',
      sender: { name: 'Hertz', email: 'billing@example.com' },
    },
  ];

  it('matches subject/sender case-insensitively and never returns unrelated rows', () => {
    expect(filterLiteralSearchPreviewItems(rows, 'DHL').map((row) => row.id)).toEqual([
      'dhl-subject',
      'dhl-sender',
    ]);
  });

  it('accepts an exact phrase wrapper and returns no row for an empty query', () => {
    expect(filterLiteralSearchPreviewItems(rows, '"Shipment update"').map((row) => row.id)).toEqual(
      ['dhl-sender'],
    );
    expect(filterLiteralSearchPreviewItems(rows, '   ')).toEqual([]);
  });

  it('plie accents, casse et espaces multiples (« réservation » ↔ « Reservation »)', () => {
    const accented = [
      {
        id: 'resa',
        subject: 'Réservation Restaurant Chez Rémy',
        sender: { name: 'Chez Rémy', email: 'contact@chezremy.pf' },
      },
    ];
    expect(filterLiteralSearchPreviewItems(accented, 'reservation restaurant')).toHaveLength(1);
    expect(filterLiteralSearchPreviewItems(accented, 'RÉSERVATION').map((r) => r.id)).toEqual([
      'resa',
    ]);
    expect(filterLiteralSearchPreviewItems(accented, '  chez   remy ')).toHaveLength(1);
    expect(filterLiteralSearchPreviewItems(accented, 'liquid studio')).toEqual([]);
  });
});

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

describe('mergeAuthoritativeWithLocalMatches — un exact local ne se perd jamais (littéral)', () => {
  type Row = { id: string; historyId?: string | null; subject?: string; unread?: boolean };
  const localInvoice: Row = { id: 'liq-1', subject: 'Facture FA-2026-00451', unread: false };
  const localOther: Row = { id: 'liq-2', subject: 'LIQUID STUDIO — relance', unread: true };

  it('page Gmail vide → les matches locaux restent affichés (cas Kura/Restaurant)', () => {
    expect(mergeAuthoritativeWithLocalMatches([], [localInvoice, localOther])).toEqual([
      localInvoice,
      localOther,
    ]);
  });

  it('Gmail divergent → locaux en tête dans leur ordre, extras Gmail après, dédup par id (cas LIQUID STUDIO)', () => {
    const gmailWrong: Row = { id: 'other-9', historyId: 'h9' };
    const out = mergeAuthoritativeWithLocalMatches([gmailWrong], [localInvoice, localOther]);
    expect(out.map((r) => r.id)).toEqual(['liq-1', 'liq-2', 'other-9']);
  });

  it('ligne locale confirmée par Gmail → champs authoritatifs greffés, position locale conservée', () => {
    const gmailThin: Row = { id: 'liq-1', historyId: 'h42' };
    const out = mergeAuthoritativeWithLocalMatches([gmailThin], [localInvoice, localOther]);
    expect(out[0]).toEqual({
      id: 'liq-1',
      historyId: 'h42',
      subject: 'Facture FA-2026-00451',
      unread: false,
    });
    expect(out.map((r) => r.id)).toEqual(['liq-1', 'liq-2']);
  });

  it('extras Gmail minces enrichis via la préview quand possible, jamais dupliqués', () => {
    const gmailConfirmed: Row = { id: 'liq-2', historyId: 'h2' };
    const gmailExtra: Row = { id: 'body-match', historyId: 'h3' };
    const out = mergeAuthoritativeWithLocalMatches(
      [gmailConfirmed, gmailExtra],
      [localInvoice, localOther],
    );
    expect(out.map((r) => r.id)).toEqual(['liq-1', 'liq-2', 'body-match']);
    expect(out.filter((r) => r.id === 'liq-2')).toHaveLength(1);
  });

  it('préview absente ou vide → composition Gmail inchangée par identité', () => {
    const gmail = [{ id: 'a', historyId: 'h' } as Row];
    expect(mergeAuthoritativeWithLocalMatches(gmail, undefined)).toBe(gmail);
    expect(mergeAuthoritativeWithLocalMatches(gmail, [])).toBe(gmail);
  });
});
