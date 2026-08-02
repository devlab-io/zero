import { resolveReplyTeamContext, type ReplyShareOption } from './reply-team-context';
import { describe, expect, it } from 'vitest';

const shareA: ReplyShareOption = { id: 'tt-a', teamId: 'team-1', teamName: 'Support' };
const shareB: ReplyShareOption = { id: 'tt-b', teamId: 'team-2', teamName: 'Ventes' };

describe('resolveReplyTeamContext — contexte équipe du composeur', () => {
  it('fil non partagé → aucun contexte, aucun sélecteur', () => {
    expect(resolveReplyTeamContext([], null)).toEqual({ share: null, requiresSelector: false });
  });

  it('partage UNIQUE → contexte attaché sans friction (pas de sélecteur)', () => {
    expect(resolveReplyTeamContext([shareA], null)).toEqual({
      share: shareA,
      requiresSelector: false,
    });
  });

  it('multi-partage → la protection ne tombe JAMAIS : défaut déterministe = premier partage + sélecteur requis', () => {
    const context = resolveReplyTeamContext([shareA, shareB], null);
    expect(context.share).toEqual(shareA);
    expect(context.requiresSelector).toBe(true);
  });

  it('multi-partage → la sélection explicite gagne', () => {
    expect(resolveReplyTeamContext([shareA, shareB], 'tt-b').share).toEqual(shareB);
  });

  it('sélection périmée (partage révoqué entre-temps) → repli sur le premier, protection conservée', () => {
    const context = resolveReplyTeamContext([shareA, shareB], 'tt-disparu');
    expect(context.share).toEqual(shareA);
    expect(context.requiresSelector).toBe(true);
  });

  it('une sélection sur partage unique est ignorée sans effet de bord', () => {
    expect(resolveReplyTeamContext([shareA], 'tt-b')).toEqual({
      share: shareA,
      requiresSelector: false,
    });
  });
});
