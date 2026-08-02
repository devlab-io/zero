import { isValidIanaTimeZone, type GoogleAccessTokenResult } from '../meetings/freebusy';
import { GOOGLE_CALENDAR_EVENTS_SCOPE } from '../google-scopes';

const GOOGLE_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MAX_WINDOW_MS = 32 * 24 * 60 * 60_000;

export class GoogleCalendarApiError extends Error {
  constructor(
    readonly operation: 'list' | 'create',
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Google Calendar ${operation} failed`);
    this.name = 'GoogleCalendarApiError';
  }
}

export type LinkedCalendarEventsAccount = {
  accountId: string;
  providerId: string;
  scopes?: readonly string[] | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  htmlLink: string | null;
  colorId: string | null;
  start: string;
  end: string;
  allDay: boolean;
  attendeeCount: number;
};

type EventCredentialDeps = {
  getAccessToken: () => Promise<GoogleAccessTokenResult>;
  fetchImpl?: typeof fetch;
};

export function hasGoogleCalendarEventsScope(
  scopes: readonly string[] | null | undefined,
): boolean {
  return (scopes ?? [])
    .flatMap((scope) => scope.split(/[\s,]+/))
    .includes(GOOGLE_CALENDAR_EVENTS_SCOPE);
}

/** Select only the Google identity backing the active mailbox. */
export function selectGoogleCalendarEventsAccount(
  accounts: readonly LinkedCalendarEventsAccount[],
  preferredAccountId: string,
): LinkedCalendarEventsAccount | null {
  return (
    accounts.find(
      (account) =>
        account.accountId === preferredAccountId &&
        account.providerId === 'google' &&
        hasGoogleCalendarEventsScope(account.scopes),
    ) ?? null
  );
}

function normalizeWindow(input: { timeMin: string; timeMax: string; timeZone: string }) {
  const start = Date.parse(input.timeMin);
  const end = Date.parse(input.timeMax);
  if (!isValidIanaTimeZone(input.timeZone)) throw new Error('Invalid calendar time zone');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Invalid calendar window');
  }
  if (end - start > MAX_WINDOW_MS) throw new Error('Calendar window is too large');
  return {
    timeMin: new Date(start).toISOString(),
    timeMax: new Date(end).toISOString(),
    timeZone: input.timeZone,
  };
}

async function credentialOrNull(deps: EventCredentialDeps) {
  const credential = await deps.getAccessToken().catch(() => null);
  if (!credential?.accessToken || !hasGoogleCalendarEventsScope(credential.scopes)) return null;
  return credential;
}

async function calendarApiError(
  response: Response,
  operation: 'list' | 'create',
): Promise<GoogleCalendarApiError> {
  let reason = 'unknown';
  try {
    const payload = (await response.clone().json()) as {
      error?: { status?: unknown; errors?: Array<{ reason?: unknown }> };
    };
    const status = payload.error?.status;
    const legacyReason = payload.error?.errors?.[0]?.reason;
    if (typeof legacyReason === 'string' && legacyReason.length <= 80) reason = legacyReason;
    else if (typeof status === 'string' && status.length <= 80) reason = status;
  } catch {
    // Fixed fallback only: provider bodies are never copied into logs or client errors.
  }
  return new GoogleCalendarApiError(operation, response.status, reason);
}

export async function listGoogleCalendarEvents(
  input: { timeMin: string; timeMax: string; timeZone: string },
  deps: EventCredentialDeps,
): Promise<{ authorizationRequired: boolean; events: CalendarEvent[] }> {
  const window = normalizeWindow(input);
  const credential = await credentialOrNull(deps);
  if (!credential) return { authorizationRequired: true, events: [] };

  const url = new URL(GOOGLE_EVENTS_ENDPOINT);
  url.searchParams.set('timeMin', window.timeMin);
  url.searchParams.set('timeMax', window.timeMax);
  url.searchParams.set('timeZone', window.timeZone);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '100');

  const response = await (deps.fetchImpl ?? fetch)(url, {
    headers: { Authorization: `Bearer ${credential.accessToken}` },
  });
  if (!response.ok) throw await calendarApiError(response, 'list');

  const payload = (await response.json()) as {
    items?: Array<{
      id?: string;
      status?: string;
      summary?: string;
      description?: string;
      location?: string;
      htmlLink?: string;
      colorId?: string;
      start?: { date?: string; dateTime?: string };
      end?: { date?: string; dateTime?: string };
      attendees?: unknown[];
    }>;
  };

  const events = (payload.items ?? []).flatMap((item): CalendarEvent[] => {
    if (!item.id || item.status === 'cancelled') return [];
    const allDay = Boolean(item.start?.date && item.end?.date);
    const start = item.start?.dateTime ?? item.start?.date;
    const end = item.end?.dateTime ?? item.end?.date;
    if (!start || !end) return [];
    return [
      {
        id: item.id,
        title: item.summary?.trim() || 'Untitled event',
        description: item.description?.trim() || null,
        location: item.location?.trim() || null,
        htmlLink: item.htmlLink || null,
        colorId: item.colorId || null,
        start,
        end,
        allDay,
        attendeeCount: item.attendees?.length ?? 0,
      },
    ];
  });

  return { authorizationRequired: false, events };
}

export type CreateCalendarEventInput = {
  title: string;
  description?: string;
  location?: string;
  attendees: string[];
  timeZone: string;
  allDay: boolean;
  start: string;
  end: string;
  createMeetLink: boolean;
};

export async function createGoogleCalendarEvent(
  input: CreateCalendarEventInput,
  deps: EventCredentialDeps,
): Promise<{ authorizationRequired: boolean; event: CalendarEvent | null }> {
  if (!isValidIanaTimeZone(input.timeZone)) throw new Error('Invalid calendar time zone');
  const credential = await credentialOrNull(deps);
  if (!credential) return { authorizationRequired: true, event: null };

  const startMs = Date.parse(input.start);
  const endMs = Date.parse(input.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('Invalid calendar event window');
  }

  const url = new URL(GOOGLE_EVENTS_ENDPOINT);
  url.searchParams.set('sendUpdates', input.attendees.length ? 'all' : 'none');
  if (input.createMeetLink) url.searchParams.set('conferenceDataVersion', '1');

  const body = {
    summary: input.title,
    description: input.description || undefined,
    location: input.location || undefined,
    attendees: input.attendees.map((email) => ({ email })),
    start: input.allDay
      ? { date: input.start.slice(0, 10) }
      : { dateTime: new Date(startMs).toISOString(), timeZone: input.timeZone },
    end: input.allDay
      ? { date: input.end.slice(0, 10) }
      : { dateTime: new Date(endMs).toISOString(), timeZone: input.timeZone },
    conferenceData: input.createMeetLink
      ? {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
      : undefined,
  };

  const response = await (deps.fetchImpl ?? fetch)(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await calendarApiError(response, 'create');

  const created = (await response.json()) as {
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    htmlLink?: string;
    colorId?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
    attendees?: unknown[];
  };
  const start = created.start?.dateTime ?? created.start?.date;
  const end = created.end?.dateTime ?? created.end?.date;
  if (!created.id || !start || !end) throw new Error('Calendar event creation returned no event');

  return {
    authorizationRequired: false,
    event: {
      id: created.id,
      title: created.summary?.trim() || input.title,
      description: created.description?.trim() || null,
      location: created.location?.trim() || null,
      htmlLink: created.htmlLink || null,
      colorId: created.colorId || null,
      start,
      end,
      allDay: Boolean(created.start?.date && created.end?.date),
      attendeeCount: created.attendees?.length ?? 0,
    },
  };
}
