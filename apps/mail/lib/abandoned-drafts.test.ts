import { isDraftAbandoned, markDraftAbandoned } from './abandoned-drafts';
import { describe, expect, it, beforeEach } from 'vitest';

describe('abandoned-drafts — mémoire locale des brouillons abandonnés', () => {
  beforeEach(() => localStorage.clear());

  it('marque puis reconnaît un brouillon abandonné', () => {
    expect(isDraftAbandoned('m1')).toBe(false);
    markDraftAbandoned('m1');
    expect(isDraftAbandoned('m1')).toBe(true);
    expect(isDraftAbandoned('autre')).toBe(false);
    expect(isDraftAbandoned(undefined)).toBe(false);
  });

  it('borne la liste et survit à un stockage corrompu', () => {
    localStorage.setItem('zero:abandoned-reply-drafts', '{pas-du-json');
    expect(isDraftAbandoned('m1')).toBe(false);
    markDraftAbandoned('m1');
    expect(isDraftAbandoned('m1')).toBe(true);
    for (let i = 0; i < 60; i++) markDraftAbandoned(`bulk-${i}`);
    // m1 est sorti de la fenêtre (50 entrées max), les récents restent.
    expect(isDraftAbandoned('m1')).toBe(false);
    expect(isDraftAbandoned('bulk-59')).toBe(true);
  });
});
