import { previewSearchText } from './search-preview';
import { describe, expect, it } from 'vitest';

describe('previewSearchText — sémantique de la préview projection-first', () => {
  it('laisse passer une phrase littérale simple', () => {
    expect(previewSearchText('Banque de Tahiti')).toBe('Banque de Tahiti');
  });

  it('trim les espaces englobants', () => {
    expect(previewSearchText('  facture  ')).toBe('facture');
  });

  it('retire les guillemets englobants (phrase exacte = substring LIKE)', () => {
    expect(previewSearchText('"Banque de Tahiti"')).toBe('Banque de Tahiti');
    expect(previewSearchText('« Banque de Tahiti »')).toBe('Banque de Tahiti');
  });

  it("refuse les opérateurs Gmail (hors sémantique substring) → ''", () => {
    expect(previewSearchText('from:banque')).toBe('');
    expect(previewSearchText('facture is:unread')).toBe('');
    expect(previewSearchText('after:2026/01/01 devis')).toBe('');
    expect(previewSearchText('label:Clients')).toBe('');
  });

  it('un opérateur DANS les guillemets englobants est aussi refusé', () => {
    expect(previewSearchText('"from:banque"')).toBe('');
  });

  it("« Re: sujet » (deux-points suivi d'un espace) n'est PAS un opérateur", () => {
    expect(previewSearchText('Re: Design review')).toBe('Re: Design review');
  });

  it("refuse les jokers LIKE SQLite `%` et `_` (LIKE sans ESCAPE → faux résultat interdit) → ''", () => {
    expect(previewSearchText('%')).toBe('');
    expect(previewSearchText('100%')).toBe('');
    expect(previewSearchText('remise 50% Banque')).toBe('');
    expect(previewSearchText('_')).toBe('');
    expect(previewSearchText('rapport_final')).toBe('');
    expect(previewSearchText('%_%')).toBe('');
  });

  it('un joker DANS les guillemets englobants est aussi refusé (la phrase devient le motif LIKE)', () => {
    expect(previewSearchText('"100%"')).toBe('');
    expect(previewSearchText('« rapport_final »')).toBe('');
  });

  it("vide ou quasi-vide → ''", () => {
    expect(previewSearchText('')).toBe('');
    expect(previewSearchText('   ')).toBe('');
    expect(previewSearchText('""')).toBe('');
  });
});
