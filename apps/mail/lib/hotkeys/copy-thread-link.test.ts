import { buildThreadLink, shouldCopyThreadLink } from './copy-thread-link';
import { describe, expect, it } from 'vitest';

// r18 : mod+c — copie du lien profond du lecteur. La copie NATIVE garde
// toujours la main (sélection ou focus éditable → rien ne part).

describe('buildThreadLink', () => {
  it('construit l’URL exacte du lecteur, composants encodés', () => {
    expect(buildThreadLink('https://zero.devlab.io', 'inbox', '19fb4a042f3a4c70')).toBe(
      'https://zero.devlab.io/mail/inbox?threadId=19fb4a042f3a4c70',
    );
    expect(buildThreadLink('https://zero.devlab.io', 'a b', 'id/été')).toBe(
      'https://zero.devlab.io/mail/a%20b?threadId=id%2F%C3%A9t%C3%A9',
    );
  });
});

describe('shouldCopyThreadLink — la copie native d’abord', () => {
  it('copie uniquement : fil ouvert, aucune sélection, focus non éditable', () => {
    expect(
      shouldCopyThreadLink({ threadId: 't1', hasTextSelection: false, isTypingTarget: false }),
    ).toBe(true);
  });

  it('une sélection de texte rend la main à la copie native', () => {
    expect(
      shouldCopyThreadLink({ threadId: 't1', hasTextSelection: true, isTypingTarget: false }),
    ).toBe(false);
  });

  it('un focus éditable rend la main à la copie native', () => {
    expect(
      shouldCopyThreadLink({ threadId: 't1', hasTextSelection: false, isTypingTarget: true }),
    ).toBe(false);
  });

  it('sans fil ouvert : rien', () => {
    expect(
      shouldCopyThreadLink({ threadId: null, hasTextSelection: false, isTypingTarget: false }),
    ).toBe(false);
  });
});
