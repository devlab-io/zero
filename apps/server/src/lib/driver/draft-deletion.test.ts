import { isDraftNotFoundError, resolveDraftForDeletion } from './draft-deletion';
import { describe, expect, it } from 'vitest';

/**
 * Mapping d'identifiants pour la suppression de brouillon (CUA round 5, échec
 * B : trois « Re: Your WHOOP order… » indélébiles — drafts.delete 404 silencieux
 * puis liste restaurée par la sync).
 */
describe('resolveDraftForDeletion', () => {
  const drafts = [
    { id: 'r-1', message: { id: 'm-1' } },
    { id: 'r-2', message: { id: 'm-2' } },
    { id: 'r-3', message: null },
  ];

  it('id de brouillon exact → lui-même', () => {
    expect(resolveDraftForDeletion(drafts, 'r-2')).toBe('r-2');
  });

  it('id de MESSAGE du brouillon → remappé vers son id de brouillon, sans toucher les autres', () => {
    expect(resolveDraftForDeletion(drafts, 'm-1')).toBe('r-1');
    expect(resolveDraftForDeletion(drafts, 'm-2')).toBe('r-2');
  });

  it('aucune correspondance exacte → null (déjà supprimé, succès idempotent)', () => {
    expect(resolveDraftForDeletion(drafts, 'inconnu')).toBeNull();
    expect(resolveDraftForDeletion([], 'r-1')).toBeNull();
  });

  it('ne matche JAMAIS par threadId ou champ non identifiant', () => {
    const withThread = [{ id: 'r-9', message: { id: 'm-9' } }];
    // un id de fil qui n'est ni draft.id ni message.id ne supprime rien
    expect(resolveDraftForDeletion(withThread, 'thread-9')).toBeNull();
  });

  it('entrées sans id ignorées', () => {
    expect(resolveDraftForDeletion([{ id: null, message: { id: 'm-x' } }], 'm-x')).toBeNull();
  });
});

describe('isDraftNotFoundError', () => {
  it('reconnaît les formes 404/400 de googleapis', () => {
    expect(isDraftNotFoundError({ code: 404 })).toBe(true);
    expect(isDraftNotFoundError({ code: '404' })).toBe(true);
    expect(isDraftNotFoundError({ response: { status: 404 } })).toBe(true);
    expect(isDraftNotFoundError({ status: 400 })).toBe(true);
    expect(isDraftNotFoundError({ message: 'Requested entity was not found.' })).toBe(true);
  });

  it('laisse passer les vraies erreurs (quota, réseau, 500)', () => {
    expect(isDraftNotFoundError({ code: 500 })).toBe(false);
    expect(isDraftNotFoundError({ code: 429, message: 'rate limit' })).toBe(false);
    expect(isDraftNotFoundError(new Error('socket hang up'))).toBe(false);
    expect(isDraftNotFoundError(null)).toBe(false);
  });
});
