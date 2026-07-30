import {
  markReplyOpened,
  stripReplyStateFromSearch,
  wasReplyOpenedSince,
} from './reply-search-params';
import { describe, expect, it } from 'vitest';

/**
 * Purge d'URL immédiate (CUA round 5, échec A) : l'écriture nuqs arrivait ~3 s
 * en retard — le nettoyage direct doit retirer mode/activeReplyId/draftId/picker
 * en conservant threadId et toute autre clé.
 */
describe('stripReplyStateFromSearch', () => {
  it('retire les clés reply et conserve threadId et les autres clés', () => {
    expect(
      stripReplyStateFromSearch('?threadId=t1&mode=replyAll&activeReplyId=m1&draftId=d1'),
    ).toBe('?threadId=t1');
    expect(stripReplyStateFromSearch('threadId=t1&picker=move&foo=bar')).toBe(
      '?threadId=t1&foo=bar',
    );
  });

  it('URL déjà propre → null (aucune écriture history à faire)', () => {
    expect(stripReplyStateFromSearch('?threadId=t1')).toBeNull();
    expect(stripReplyStateFromSearch('')).toBeNull();
  });

  it('toutes les clés reply sans autre paramètre → chaîne vide (URL nue)', () => {
    expect(stripReplyStateFromSearch('?mode=reply&activeReplyId=m1')).toBe('');
  });
});

describe('marqueur de réouverture — la boucle de vérification ne mange jamais une vraie intention', () => {
  it('une ouverture postérieure au début de purge arrête la boucle', () => {
    const purgeStartedAt = 1_000;
    expect(wasReplyOpenedSince(purgeStartedAt)).toBe(false);
    markReplyOpened(1_500);
    expect(wasReplyOpenedSince(purgeStartedAt)).toBe(true);
    // une purge DÉMARRÉE après cette ouverture n'est pas bloquée par elle
    expect(wasReplyOpenedSince(2_000)).toBe(false);
  });
});
