import { describe, expect, it } from 'vitest';
import { GOOGLE_OAUTH_SCOPES, GOOGLE_OAUTH_SCOPE_STRING } from './google-scopes';

// Config auth (A?/V5.2 §config auth) : la portée OAuth interactive est l'union MINIMALE.
// Le scope illimité mail.google.com — et toute portée restreinte plus large — est exclu.
describe('GOOGLE_OAUTH_SCOPES — union minimale', () => {
  it('contient exactement modify + compose + userinfo (profile/email)', () => {
    expect([...GOOGLE_OAUTH_SCOPES]).toEqual([
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ]);
  });

  it('n’inclut JAMAIS le scope illimité mail.google.com', () => {
    expect(GOOGLE_OAUTH_SCOPES).not.toContain('https://mail.google.com/');
    for (const s of GOOGLE_OAUTH_SCOPES) expect(s).not.toContain('mail.google.com');
  });

  it('n’inclut aucune portée trop large (readonly, full, settings)', () => {
    const forbidden = ['gmail.readonly', 'gmail.full', 'gmail.settings', 'gmail.metadata'];
    for (const scope of GOOGLE_OAUTH_SCOPES) {
      for (const f of forbidden) expect(scope).not.toContain(f);
    }
  });

  it('gmail.modify (triage/lecture) et gmail.compose (brouillons/envoi) sont présents', () => {
    const joined = GOOGLE_OAUTH_SCOPES.join(' ');
    expect(joined).toContain('auth/gmail.modify');
    expect(joined).toContain('auth/gmail.compose');
  });
});

describe('GOOGLE_OAUTH_SCOPE_STRING', () => {
  it('joint les scopes par une espace, dans l’ordre', () => {
    expect(GOOGLE_OAUTH_SCOPE_STRING).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
    expect(GOOGLE_OAUTH_SCOPE_STRING.split(' ')).toHaveLength(GOOGLE_OAUTH_SCOPES.length);
    expect(GOOGLE_OAUTH_SCOPE_STRING).not.toContain('mail.google.com');
  });
});
