import { foldSearchText } from './search-fold';
import { describe, expect, it } from 'vitest';

describe('foldSearchText — accents/casse/espaces pliés (client)', () => {
  it('plie les accents français vers l’ASCII', () => {
    expect(foldSearchText('Réservation')).toBe('reservation');
    expect(foldSearchText('château, forêt, où, ça, Noël')).toBe('chateau, foret, ou, ca, noel');
  });

  it('abaisse la casse, y compris les majuscules accentuées', () => {
    expect(foldSearchText('RÉSERVATION É È À Ç')).toBe('reservation e e a c');
  });

  it('réduit les espaces multiples et trim', () => {
    expect(foldSearchText('  Banque   de\tTahiti  ')).toBe('banque de tahiti');
  });

  it('traite le slash du sujet comme une frontière de mots', () => {
    expect(foldSearchText('Reçu Restaurant/35506')).toBe('recu restaurant 35506');
  });

  it('plie les ligatures œ/æ', () => {
    expect(foldSearchText('Œuvre cœur Ægide')).toBe('oeuvre coeur aegide');
  });

  it('laisse l’ASCII simple intact', () => {
    expect(foldSearchText('LIQUID STUDIO')).toBe('liquid studio');
    expect(foldSearchText('FA-2026-00451')).toBe('fa-2026-00451');
  });
});
