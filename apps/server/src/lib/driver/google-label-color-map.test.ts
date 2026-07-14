import { describe, expect, it } from 'vitest';
import {
  GOOGLE_LABEL_COLOR_MAP,
  mapGoogleLabelColor,
  mapToGoogleLabelColor,
} from './google-label-color-map';

// Comportement réel du mapping bidirectionnel couleurs Gmail ⇄ palette interne. Tests
// anti-tautologie : chaque assertion échoue si le mapping ou les gardes changent.

describe('mapGoogleLabelColor — Gmail → interne', () => {
  it('undefined en entrée → undefined (garde)', () => {
    expect(mapGoogleLabelColor(undefined)).toBeUndefined();
  });

  it('couleur incomplète (bg ou text manquant) → renvoyée telle quelle', () => {
    expect(mapGoogleLabelColor({ backgroundColor: '', textColor: '#fff' })).toEqual({
      backgroundColor: '',
      textColor: '#fff',
    });
    expect(mapGoogleLabelColor({ backgroundColor: '#16a766', textColor: '' })).toEqual({
      backgroundColor: '#16a766',
      textColor: '',
    });
  });

  it('clé Gmail connue → couleur interne mappée', () => {
    // Clé = `${backgroundColor}|${textColor}`.
    expect(mapGoogleLabelColor({ backgroundColor: '#16a766', textColor: '#ffffff' })).toEqual({
      textColor: '#D1F0D9',
      backgroundColor: '#12341D',
    });
    expect(mapGoogleLabelColor({ backgroundColor: '#ffffff', textColor: '#000000' })).toEqual(
      GOOGLE_LABEL_COLOR_MAP['#ffffff|#000000'],
    );
  });

  it('clé inconnue → couleur d’origine (pas de mapping fabriqué)', () => {
    const unknown = { backgroundColor: '#123456', textColor: '#abcdef' };
    expect(mapGoogleLabelColor(unknown)).toEqual(unknown);
  });
});

describe('mapToGoogleLabelColor — interne → Gmail', () => {
  it('undefined / incomplète → renvoyée telle quelle', () => {
    expect(mapToGoogleLabelColor(undefined)).toBeUndefined();
    expect(mapToGoogleLabelColor({ backgroundColor: '#12341D', textColor: '' })).toEqual({
      backgroundColor: '#12341D',
      textColor: '',
    });
  });

  it('valeur interne connue → clé Gmail décomposée (bg|text)', () => {
    // Réciproque : interne {bg:#12341D,text:#D1F0D9} → Gmail {bg:#16a766,text:#ffffff}.
    expect(
      mapToGoogleLabelColor({ backgroundColor: '#12341D', textColor: '#D1F0D9' }),
    ).toEqual({ backgroundColor: '#16a766', textColor: '#ffffff' });
  });

  it('round-trip Gmail → interne → Gmail conserve la couleur', () => {
    const gmail = { backgroundColor: '#4a86e8', textColor: '#ffffff' };
    const internal = mapGoogleLabelColor(gmail)!;
    expect(mapToGoogleLabelColor(internal)).toEqual(gmail);
  });

  it('valeur interne inconnue → renvoyée telle quelle', () => {
    const custom = { backgroundColor: '#000001', textColor: '#000002' };
    expect(mapToGoogleLabelColor(custom)).toEqual(custom);
  });
});
