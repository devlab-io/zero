import {
  createGoogleCalendarEvent,
  hasGoogleCalendarEventsScope,
  listGoogleCalendarEvents,
  selectGoogleCalendarEventsAccount,
} from './events';
import { GOOGLE_CALENDAR_EVENTS_SCOPE } from '../google-scopes';
import { describe, expect, it, vi } from 'vitest';

const credential = async () => ({
  accessToken: 'calendar-token',
  scopes: [GOOGLE_CALENDAR_EVENTS_SCOPE],
});

describe('Google calendar events boundary', () => {
  it('selects only the exact active Google account carrying the event scope', () => {
    expect(hasGoogleCalendarEventsScope([`openid ${GOOGLE_CALENDAR_EVENTS_SCOPE}`])).toBe(true);
    expect(
      selectGoogleCalendarEventsAccount(
        [
          { accountId: 'other', providerId: 'google', scopes: [GOOGLE_CALENDAR_EVENTS_SCOPE] },
          { accountId: 'active', providerId: 'google', scopes: [GOOGLE_CALENDAR_EVENTS_SCOPE] },
        ],
        'active',
      )?.accountId,
    ).toBe('active');
  });

  it('returns an explicit authorization state before calling Google', async () => {
    const fetchImpl = vi.fn();
    await expect(
      listGoogleCalendarEvents(
        {
          timeMin: '2026-08-02T00:00:00.000Z',
          timeMax: '2026-08-03T00:00:00.000Z',
          timeZone: 'Pacific/Auckland',
        },
        { getAccessToken: async () => ({ accessToken: null, scopes: [] }), fetchImpl },
      ),
    ).resolves.toEqual({ authorizationRequired: true, events: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lists a bounded, ordered primary-calendar day and normalizes events', async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toContain('/calendars/primary/events');
      expect(parsed.searchParams.get('singleEvents')).toBe('true');
      expect(parsed.searchParams.get('orderBy')).toBe('startTime');
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'evt-1',
              summary: 'Client review',
              start: { dateTime: '2026-08-02T09:00:00+12:00' },
              end: { dateTime: '2026-08-02T10:00:00+12:00' },
              attendees: [{ email: 'client@example.com' }],
            },
            { id: 'cancelled', status: 'cancelled' },
          ],
        }),
      );
    });
    const result = await listGoogleCalendarEvents(
      {
        timeMin: '2026-08-01T12:00:00.000Z',
        timeMax: '2026-08-02T12:00:00.000Z',
        timeZone: 'Pacific/Auckland',
      },
      { getAccessToken: credential, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(result.authorizationRequired).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ title: 'Client review', attendeeCount: 1 });
  });

  it('keeps Google failures bounded to status + provider reason', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              status: 'PERMISSION_DENIED',
              message: 'sensitive provider detail',
              errors: [{ reason: 'accessNotConfigured' }],
            },
          }),
          { status: 403 },
        ),
    );
    const result = listGoogleCalendarEvents(
      {
        timeMin: '2026-08-01T12:00:00.000Z',
        timeMax: '2026-08-02T12:00:00.000Z',
        timeZone: 'Pacific/Auckland',
      },
      { getAccessToken: credential, fetchImpl: fetchImpl as typeof fetch },
    );
    await expect(result).rejects.toMatchObject({
      name: 'GoogleCalendarApiError',
      operation: 'list',
      status: 403,
      reason: 'accessNotConfigured',
    });
  });

  it('creates explicitly and sends updates only when guests exist', async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get('sendUpdates')).toBe('all');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.attendees).toEqual([{ email: 'client@example.com' }]);
      return new Response(
        JSON.stringify({
          id: 'evt-created',
          summary: body.summary,
          start: body.start,
          end: body.end,
          attendees: body.attendees,
          htmlLink: 'https://calendar.google.com/event?eid=created',
        }),
      );
    });
    const result = await createGoogleCalendarEvent(
      {
        title: 'Client review',
        attendees: ['client@example.com'],
        timeZone: 'Pacific/Auckland',
        allDay: false,
        start: '2026-08-02T09:00:00+12:00',
        end: '2026-08-02T10:00:00+12:00',
        createMeetLink: false,
      },
      { getAccessToken: credential, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(result.event?.id).toBe('evt-created');
  });
});
