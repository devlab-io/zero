import { isAuthorizedVoiceCaller, secretsMatch } from './voice-auth';
import { describe, expect, it } from 'vitest';

/**
 * Preuve unitaire du garde des routes vocales (pitbull A7, axe 4). La régression épinglée :
 * `env.VOICE_SECRET !== header` laissait passer quand le secret n'était pas configuré
 * (`undefined !== undefined` est faux), si bien que `/api/ai/do/:action` exécutait les
 * outils de l'agent sur la boîte mail d'un utilisateur à qui il suffisait de connaître son
 * numéro de téléphone vérifié.
 */
describe('isAuthorizedVoiceCaller', () => {
  it('refuse quand aucun secret n’est configuré, même si l’appelant n’envoie rien', () => {
    expect(isAuthorizedVoiceCaller(undefined, undefined)).toBe(false);
    expect(isAuthorizedVoiceCaller(null, null)).toBe(false);
    expect(isAuthorizedVoiceCaller('', '')).toBe(false);
  });

  it('refuse quand le secret est configuré mais absent de la requête', () => {
    expect(isAuthorizedVoiceCaller('s3cret', undefined)).toBe(false);
    expect(isAuthorizedVoiceCaller('s3cret', '')).toBe(false);
  });

  it('refuse un secret voisin (préfixe, suffixe, casse)', () => {
    expect(isAuthorizedVoiceCaller('s3cret', 's3cre')).toBe(false);
    expect(isAuthorizedVoiceCaller('s3cret', 's3crett')).toBe(false);
    expect(isAuthorizedVoiceCaller('s3cret', 'S3CRET')).toBe(false);
  });

  it('accepte le secret exact', () => {
    expect(isAuthorizedVoiceCaller('s3cret', 's3cret')).toBe(true);
  });
});

describe('secretsMatch', () => {
  it('ne sort pas tôt sur une divergence de premier octet', () => {
    expect(secretsMatch('abcdef', 'zbcdef')).toBe(false);
    expect(secretsMatch('abcdef', 'abcdez')).toBe(false);
  });

  it('gère l’unicode sans faux positif', () => {
    expect(secretsMatch('clé-é', 'clé-é')).toBe(true);
    expect(secretsMatch('clé-é', 'cle-e')).toBe(false);
  });

  it('refuse toute valeur non textuelle', () => {
    expect(secretsMatch('x', undefined)).toBe(false);
    expect(secretsMatch('x', null)).toBe(false);
  });
});
