import { isSimpleLiteralSearch } from './search-intent';
import { describe, expect, it } from 'vitest';

describe('isSimpleLiteralSearch — bypass déterministe du détour IA (CUA 2026-07-30)', () => {
  describe('littéral simple → bypass (recherche exacte immédiate)', () => {
    it.each([
      'Banque de Tahiti',
      'facture',
      'Socredo',
      'thomas@devlab.io',
      'Re: Design review',
      '"Banque de Tahiti"',
      'devis Kura v2',
    ])('%s', (q) => {
      expect(isSimpleLiteralSearch(q)).toBe(true);
    });
  });

  describe('opérateurs Gmail → IA conservée', () => {
    it.each([
      'from:banque',
      'facture is:unread',
      'subject:devis socredo',
      'after:2026/01/01 devis',
      'label:Clients',
      '"from:banque"',
    ])('%s', (q) => {
      expect(isSimpleLiteralSearch(q)).toBe(false);
    });
  });

  describe('dates → IA conservée', () => {
    it.each(['factures mars', 'devis 2026', 'relevé 12/03', 'meeting january'])('%s', (q) => {
      expect(isSimpleLiteralSearch(q)).toBe(false);
    });
  });

  describe('intention naturelle (en/fr) → IA conservée', () => {
    it.each([
      'emails from Paul',
      'unread messages',
      'mails reçus hier',
      'devis envoyés la semaine dernière',
      'factures avec pièce jointe',
      'messages non lus',
      'tout depuis lundi dernier',
    ])('%s', (q) => {
      expect(isSimpleLiteralSearch(q)).toBe(false);
    });
  });

  describe('syntaxe booléenne / négation / joker → IA conservée', () => {
    it.each(['facture OR devis', '-newsletter', 'banque *', '(facture)'])('%s', (q) => {
      expect(isSimpleLiteralSearch(q)).toBe(false);
    });
  });

  describe('bornes de forme', () => {
    it('vide ou blanc → jamais bypass', () => {
      expect(isSimpleLiteralSearch('')).toBe(false);
      expect(isSimpleLiteralSearch('   ')).toBe(false);
      expect(isSimpleLiteralSearch('""')).toBe(false);
    });

    it('trop long ou trop de mots → IA (une phrase-fleuve est une intention)', () => {
      expect(isSimpleLiteralSearch('a'.repeat(81))).toBe(false);
      expect(isSimpleLiteralSearch('un deux trois quatre cinq six sept huit neuf')).toBe(false);
    });
  });
});
