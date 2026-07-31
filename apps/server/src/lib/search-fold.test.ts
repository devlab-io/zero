import { foldSearchText, SEARCH_FOLD_PAIRS, toLikePattern } from './search-fold';
import { describe, expect, it } from 'vitest';

describe('foldSearchText — pliage JS de l’aiguille (serveur)', () => {
  it('plie accents et casse', () => {
    expect(foldSearchText('Réservation Restaurant Chez Rémy')).toBe(
      'reservation restaurant chez remy',
    );
    expect(foldSearchText('RÉSERVATION')).toBe('reservation');
  });

  it('réduit les espaces multiples et trim', () => {
    expect(foldSearchText('  Banque   de Tahiti ')).toBe('banque de tahiti');
  });

  it('plie les ligatures œ/æ', () => {
    expect(foldSearchText('Œuvre cœur')).toBe('oeuvre coeur');
  });
});

describe('SEARCH_FOLD_PAIRS — accord SQL/JS', () => {
  it('chaque caractère de la table SQL se plie en JS vers la même cible', () => {
    for (const [from, to] of SEARCH_FOLD_PAIRS) {
      expect(foldSearchText(from)).toBe(to);
    }
  });

  it('les deux casses de chaque lettre accentuée sont couvertes', () => {
    const sources = new Set(SEARCH_FOLD_PAIRS.map(([from]) => from));
    for (const from of sources) {
      const upper = from.toUpperCase();
      const lower = from.toLowerCase();
      expect(sources.has(upper), `casse manquante pour ${upper}`).toBe(true);
      expect(sources.has(lower), `casse manquante pour ${lower}`).toBe(true);
    }
  });
});

describe('toLikePattern — aiguille toujours littérale', () => {
  it('encadre de % et neutralise %, _ et \\', () => {
    expect(toLikePattern('facture')).toBe('%facture%');
    expect(toLikePattern('100%')).toBe('%100\\%%');
    expect(toLikePattern('rapport_final')).toBe('%rapport\\_final%');
    expect(toLikePattern('a\\b')).toBe('%a\\\\b%');
  });
});
