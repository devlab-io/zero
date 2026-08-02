import {
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_OAUTH_SCOPE_STRING,
} from './google-scopes';
import { describe, expect, it } from 'vitest';

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

describe('P11 — scope calendrier INCRÉMENTAL, jamais par défaut', () => {
  it('GOOGLE_OAUTH_SCOPES ne contient AUCUN scope calendrier (le login par défaut ne s’élargit jamais)', () => {
    for (const scope of GOOGLE_OAUTH_SCOPES) {
      expect(scope).not.toContain('calendar');
    }
    expect(GOOGLE_OAUTH_SCOPE_STRING).not.toContain('calendar');
  });

  it('le scope incrémental est freebusy STRICT — ni écriture, ni lecture des événements', () => {
    expect(GOOGLE_CALENDAR_FREEBUSY_SCOPE).toBe(
      'https://www.googleapis.com/auth/calendar.freebusy',
    );
    // calendar.readonly permettrait de VOIR les événements — interdit ici.
    expect(GOOGLE_CALENDAR_FREEBUSY_SCOPE).not.toContain('readonly');
    expect(
      (GOOGLE_OAUTH_SCOPES as readonly string[]).includes(GOOGLE_CALENDAR_FREEBUSY_SCOPE),
    ).toBe(false);
  });

  it('calendar.events reste incrémental et plus étroit que la gestion complète du calendrier', () => {
    expect(GOOGLE_CALENDAR_EVENTS_SCOPE).toBe('https://www.googleapis.com/auth/calendar.events');
    expect(GOOGLE_CALENDAR_EVENTS_SCOPE).not.toBe('https://www.googleapis.com/auth/calendar');
    expect((GOOGLE_OAUTH_SCOPES as readonly string[]).includes(GOOGLE_CALENDAR_EVENTS_SCOPE)).toBe(
      false,
    );
  });
});
