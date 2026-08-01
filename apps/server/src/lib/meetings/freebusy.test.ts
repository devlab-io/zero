import {
  INVALID_CALENDAR_TIME_ZONE,
  hasGoogleFreeBusyScope,
  loadGoogleAvailability,
  selectGoogleFreeBusyAccount,
} from './freebusy';
import { GOOGLE_CALENDAR_FREEBUSY_SCOPE } from '../google-scopes';
import { describe, expect, it, vi } from 'vitest';

const input = {
  timeMin: '2026-08-03T01:00:00.000Z',
  timeMax: '2026-08-03T01:30:00.000Z',
  timeZone: 'Pacific/Auckland',
};

describe('P11 Google FreeBusy — scope minimal et lecture seule', () => {
  it('reconnaît le scope même dans les formats espace/virgule de Better Auth', () => {
    expect(hasGoogleFreeBusyScope([`openid ${GOOGLE_CALENDAR_FREEBUSY_SCOPE}`])).toBe(true);
    expect(hasGoogleFreeBusyScope([`openid,${GOOGLE_CALENDAR_FREEBUSY_SCOPE}`])).toBe(true);
    expect(hasGoogleFreeBusyScope(['openid', 'email'])).toBe(false);
  });

  it('accepte UTC, mais rejette les identifiants de fuseau non-IANA', async () => {
    await expect(
      loadGoogleAvailability({ ...input, timeZone: 'UTC' }, { getAccessToken: async () => ({}) }),
    ).resolves.toEqual({ authorizationRequired: true, busy: [] });
  });

  it('sélectionne exclusivement le compte Google actif, jamais le premier compte éligible', () => {
    const accounts = [
      {
        providerId: 'google',
        accountId: 'other-calendar-authorized',
        scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE],
      },
      { providerId: 'microsoft', accountId: 'ms', scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE] },
      { providerId: 'google', accountId: 'gmail-only', scopes: ['openid'] },
      {
        providerId: 'google',
        accountId: 'calendar-authorized',
        scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE],
      },
    ];
    expect(selectGoogleFreeBusyAccount(accounts, 'calendar-authorized')?.accountId).toBe(
      'calendar-authorized',
    );
    expect(selectGoogleFreeBusyAccount(accounts, 'gmail-only')).toBeNull();
    expect(selectGoogleFreeBusyAccount(accounts, 'missing-account')).toBeNull();
    expect(selectGoogleFreeBusyAccount([], 'calendar-authorized')).toBeNull();
  });

  it('sans token ou scope dédié : demande une autorisation et ne contacte jamais Google', async () => {
    const fetchImpl = vi.fn();
    await expect(
      loadGoogleAvailability(input, {
        getAccessToken: async () => ({ accessToken: 'secret', scopes: ['openid'] }),
        fetchImpl,
      }),
    ).resolves.toEqual({ authorizationRequired: true, busy: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('interroge uniquement primary et ne renvoie que les intervalles busy', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer calendar-token');
      expect(JSON.parse(String(init?.body))).toEqual({
        ...input,
        items: [{ id: 'primary' }],
      });
      return new Response(
        JSON.stringify({
          calendars: {
            primary: {
              busy: [
                { start: '2026-08-03T01:05:00Z', end: '2026-08-03T01:20:00Z' },
                { start: 'invalid', end: '2026-08-03T01:25:00Z' },
              ],
            },
          },
        }),
      );
    });

    await expect(
      loadGoogleAvailability(input, {
        getAccessToken: async () => ({
          accessToken: 'calendar-token',
          scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE],
        }),
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({
      authorizationRequired: false,
      busy: [{ start: '2026-08-03T01:05:00.000Z', end: '2026-08-03T01:20:00.000Z' }],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejette les fenêtres invalides ou démesurées avant tout accès réseau', async () => {
    const getAccessToken = vi.fn();
    await expect(
      loadGoogleAvailability({ ...input, timeMax: input.timeMin }, { getAccessToken }),
    ).rejects.toThrow('Invalid availability window');
    await expect(
      loadGoogleAvailability({ ...input, timeMax: '2026-10-03T01:00:00.000Z' }, { getAccessToken }),
    ).rejects.toThrow('Availability window is too large');
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('rejette un fuseau non-IANA avant tout accès aux credentials ou à Google', async () => {
    const getAccessToken = vi.fn();
    const fetchImpl = vi.fn();
    await expect(
      loadGoogleAvailability({ ...input, timeZone: 'Mars/Olympus' }, { getAccessToken, fetchImpl }),
    ).rejects.toThrow(INVALID_CALENDAR_TIME_ZONE);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('échoue avec un message fixe sans relayer le corps Google', async () => {
    await expect(
      loadGoogleAvailability(input, {
        getAccessToken: async () => ({
          accessToken: 'secret',
          scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE],
        }),
        fetchImpl: async () => new Response('token leaked in provider body', { status: 403 }),
      }),
    ).rejects.toThrow('Calendar availability lookup failed');
  });
});
