import {
  __resetActiveConnectionStoreForTests,
  getActiveConnectionId,
  setActiveConnectionId,
} from './active-connection-store';
import {
  purgeClientIdentityHints,
  readCacheOwnerHint,
  resolveCacheOwner,
  writeCacheOwnerHint,
} from './cache-owner-hint';
import { afterEach, describe, expect, it } from 'vitest';

// L'identité du cache (QueryClient + persister IndexedDB) est `user-connexion`.
// Garantie P0 : AUCUNE identité user-scopée avant confirmation de session — un
// hint localStorage n'est jamais vérifiable côté client, donc jamais consulté.
// La purge au logout est une hygiène complémentaire, pas la preuve.
afterEach(() => {
  __resetActiveConnectionStoreForTests();
  window.localStorage.clear();
});

describe('resolveCacheOwner — aucune identité user-scopée avant confirmation', () => {
  it('hint périmé injecté SANS logout, même connectionId : pending → identité anonyme, aucun cache user restauré', () => {
    // Simule un crash navigateur / vieux build : le hint du compte user-1 est
    // resté en place sans jamais passer par signOut.
    writeCacheOwnerHint('user-1-conn-a');
    setActiveConnectionId('conn-a');

    const pendingOwner = resolveCacheOwner({
      sessionUserId: null,
      isSessionPending: true,
      connectionId: getActiveConnectionId(),
      hint: readCacheOwnerHint(),
    });

    // Shell neutre : ce n'est la clé d'AUCUN persister user-scopé — zéro row
    // d'un ancien compte ne peut être restaurée ni peinte pendant pending.
    expect(pendingOwner).toBe('anonymous-conn-a');
    expect(pendingOwner.includes('user-1')).toBe(false);
  });

  it('après résolution MÊME identité : le cache chaud du compte est sélectionné', () => {
    writeCacheOwnerHint('user-1-conn-a');
    setActiveConnectionId('conn-a');

    const owner = resolveCacheOwner({
      sessionUserId: 'user-1',
      isSessionPending: false,
      connectionId: getActiveConnectionId(),
      hint: readCacheOwnerHint(),
    });
    expect(owner).toBe('user-1-conn-a'); // même persister qu'avant : cache conservé
  });

  it('après résolution AUTRE identité : jamais le persister du compte précédent', () => {
    writeCacheOwnerHint('user-1-conn-a');
    setActiveConnectionId('conn-a');

    const owner = resolveCacheOwner({
      sessionUserId: 'user-2',
      isSessionPending: false,
      connectionId: getActiveConnectionId(),
      hint: readCacheOwnerHint(),
    });
    expect(owner).toBe('user-2-conn-a');
    expect(owner.includes('user-1')).toBe(false);
  });

  it('session résolue sans utilisateur (déconnecté) → identité anonyme', () => {
    expect(
      resolveCacheOwner({
        sessionUserId: null,
        isSessionPending: false,
        connectionId: null,
        hint: 'user-1-conn-a',
      }),
    ).toBe('anonymous-default');
  });

  it('changement de connexion → identité différente → persister différent', () => {
    const a = resolveCacheOwner({
      sessionUserId: 'user-1',
      isSessionPending: false,
      connectionId: 'conn-a',
      hint: null,
    });
    const b = resolveCacheOwner({
      sessionUserId: 'user-1',
      isSessionPending: false,
      connectionId: 'conn-b',
      hint: null,
    });
    expect(a).not.toBe(b);
  });
});

describe('purgeClientIdentityHints — hygiène logout (complément, pas preuve)', () => {
  it('efface les deux hints sur tout chemin de déconnexion', () => {
    writeCacheOwnerHint('user-1-conn-a');
    setActiveConnectionId('conn-a');

    purgeClientIdentityHints();

    expect(readCacheOwnerHint()).toBeNull();
    expect(getActiveConnectionId()).toBeNull();
  });
});
