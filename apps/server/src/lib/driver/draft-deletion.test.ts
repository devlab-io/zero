import {
  isDraftNotFoundError,
  planDraftProjectionCleanup,
  resolveDraftForDeletion,
  threadHasOtherDrafts,
} from './draft-deletion';
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

describe('threadHasOtherDrafts — état du fil après suppression', () => {
  it('un autre message DRAFT subsiste → true (ne pas dé-labelliser le fil)', () => {
    expect(
      threadHasOtherDrafts(
        [
          { id: 'm-keep', labelIds: ['DRAFT'] },
          { id: 'm-real', labelIds: ['INBOX'] },
        ],
        'm-deleted',
      ),
    ).toBe(true);
  });

  it('seul le message supprimé portait DRAFT → false', () => {
    expect(
      threadHasOtherDrafts(
        [
          { id: 'm-deleted', labelIds: ['DRAFT'] },
          { id: 'm-real', labelIds: ['INBOX'] },
        ],
        'm-deleted',
      ),
    ).toBe(false);
    expect(threadHasOtherDrafts([], 'm-deleted')).toBe(false);
  });
});

describe('planDraftProjectionCleanup — nettoyage minimal et exact', () => {
  it('fil disparu de Gmail → retirer le fil de la projection', () => {
    expect(
      planDraftProjectionCleanup({ threadId: 't1', threadGone: true, hasOtherDrafts: false }),
    ).toEqual({ action: 'delete-thread', threadId: 't1' });
  });

  it('fil présent, plus aucun brouillon → retirer le label DRAFT du fil', () => {
    expect(
      planDraftProjectionCleanup({ threadId: 't1', threadGone: false, hasOtherDrafts: false }),
    ).toEqual({ action: 'remove-draft-label', threadId: 't1' });
  });

  it('d’autres brouillons subsistent (les 2 WHOOP restants) → NE RIEN toucher', () => {
    expect(
      planDraftProjectionCleanup({ threadId: 't1', threadGone: false, hasOtherDrafts: true }),
    ).toEqual({ action: 'none', threadId: 't1' });
  });

  it('identifiants inconnus (déjà supprimé) → aucun nettoyage', () => {
    expect(
      planDraftProjectionCleanup({ threadId: null, threadGone: false, hasOtherDrafts: false }),
    ).toEqual({ action: 'none', threadId: null });
  });
});
