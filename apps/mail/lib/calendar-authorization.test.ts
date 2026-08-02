import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-client', () => ({ $fetch: vi.fn() }));

import {
  buildCalendarAuthorizationRequest,
  buildCalendarEventsAuthorizationRequest,
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  hasCalendarFreebusyScope,
} from './calendar-authorization';

// P11 — la voie incrémentale ne peut demander QUE calendar.freebusy
// (libre/occupé, jamais le contenu des événements), et la détection de scope
// déjà accordé est exacte par fournisseur.

describe('buildCalendarAuthorizationRequest — corps EXACT du /link-social', () => {
  it('provider google + LE SEUL scope freebusy, callback fourni', () => {
    const request = buildCalendarAuthorizationRequest('https://app.test/mail/inbox');
    expect(request).toEqual({
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/calendar.freebusy'],
      callbackURL: 'https://app.test/mail/inbox',
    });
    // Ni écriture, ni LECTURE des événements — freebusy strict.
    expect(request.scopes.join(' ')).not.toMatch(/calendar\.events|readonly|calendar$/);
    expect(request.scopes).toHaveLength(1);
  });

  it('le scope incrémental n’est pas un scope Gmail (aucun élargissement du login)', () => {
    expect(GOOGLE_CALENDAR_FREEBUSY_SCOPE).not.toContain('gmail');
  });
});

describe('hasCalendarFreebusyScope', () => {
  it('vrai uniquement pour un compte GOOGLE portant exactement le scope freebusy', () => {
    expect(
      hasCalendarFreebusyScope([
        { providerId: 'google', scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE] },
      ]),
    ).toBe(true);
    expect(
      hasCalendarFreebusyScope([{ provider: 'google', scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE] }]),
    ).toBe(true);
  });

  it('faux sans le scope, sur un autre provider, ou sans comptes', () => {
    expect(hasCalendarFreebusyScope([])).toBe(false);
    expect(hasCalendarFreebusyScope([{ providerId: 'google', scopes: [] }])).toBe(false);
    expect(hasCalendarFreebusyScope([{ providerId: 'google', scopes: null }])).toBe(false);
    expect(
      hasCalendarFreebusyScope([
        { providerId: 'microsoft', scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE] },
      ]),
    ).toBe(false);
  });
});

describe('Agenda global — consentement événements incrémental', () => {
  it('demande calendar.events seul et conserve le login par défaut intact', () => {
    expect(buildCalendarEventsAuthorizationRequest('https://app.test/mail/inbox')).toEqual({
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      callbackURL: 'https://app.test/mail/inbox',
    });
    expect(GOOGLE_CALENDAR_EVENTS_SCOPE).not.toContain('gmail');
    expect(GOOGLE_CALENDAR_EVENTS_SCOPE).not.toBe('https://www.googleapis.com/auth/calendar');
  });
});
