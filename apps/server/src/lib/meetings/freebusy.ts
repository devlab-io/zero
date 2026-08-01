import { GOOGLE_CALENDAR_FREEBUSY_SCOPE } from '../google-scopes';

const GOOGLE_FREEBUSY_ENDPOINT = 'https://www.googleapis.com/calendar/v3/freeBusy';
const MAX_AVAILABILITY_WINDOW_MS = 31 * 24 * 60 * 60_000;

export type GoogleAccessTokenResult = {
  accessToken?: string | null;
  scopes?: readonly string[] | null;
};

export type LinkedCalendarAccount = {
  accountId: string;
  providerId: string;
  scopes?: readonly string[] | null;
};

export type AvailabilityInterval = { start: string; end: string };

export type GoogleAvailabilityResult =
  | { authorizationRequired: true; busy: [] }
  | { authorizationRequired: false; busy: AvailabilityInterval[] };

export function hasGoogleFreeBusyScope(scopes: readonly string[] | null | undefined): boolean {
  return (scopes ?? [])
    .flatMap((scope) => scope.split(/[\s,]+/))
    .includes(GOOGLE_CALENDAR_FREEBUSY_SCOPE);
}

/** Select only an account owned by the current Better Auth session. */
export function selectGoogleFreeBusyAccount(
  accounts: readonly LinkedCalendarAccount[],
): LinkedCalendarAccount | null {
  return (
    accounts.find(
      (account) => account.providerId === 'google' && hasGoogleFreeBusyScope(account.scopes),
    ) ?? null
  );
}

function parseAvailabilityWindow(timeMin: string, timeMax: string) {
  const start = Date.parse(timeMin);
  const end = Date.parse(timeMax);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Invalid availability window');
  }
  if (end - start > MAX_AVAILABILITY_WINDOW_MS) {
    throw new Error('Availability window is too large');
  }
  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() };
}

/**
 * P11 — read-only Google FreeBusy lookup. The credential supplier is Better
 * Auth's getAccessToken endpoint, so expiry/refresh stays inside the auth
 * boundary. Only the primary calendar is queried and neither event titles nor
 * descriptions can be returned by this API/scope.
 */
export async function loadGoogleAvailability(
  input: { timeMin: string; timeMax: string; timeZone: string },
  deps: {
    getAccessToken: () => Promise<GoogleAccessTokenResult>;
    fetchImpl?: typeof fetch;
  },
): Promise<GoogleAvailabilityResult> {
  const window = parseAvailabilityWindow(input.timeMin, input.timeMax);
  const credential = await deps.getAccessToken().catch(() => null);
  if (!credential?.accessToken || !hasGoogleFreeBusyScope(credential.scopes)) {
    return { authorizationRequired: true, busy: [] };
  }

  const response = await (deps.fetchImpl ?? fetch)(GOOGLE_FREEBUSY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...window,
      timeZone: input.timeZone,
      items: [{ id: 'primary' }],
    }),
  });
  if (!response.ok) throw new Error('Calendar availability lookup failed');

  const payload = (await response.json()) as {
    calendars?: {
      primary?: {
        busy?: { start?: string; end?: string }[];
        errors?: unknown[];
      };
    };
  };
  const primary = payload.calendars?.primary;
  if (primary?.errors?.length) throw new Error('Calendar availability lookup failed');

  const busy = (primary?.busy ?? []).flatMap((interval) => {
    if (!interval.start || !interval.end) return [];
    const start = Date.parse(interval.start);
    const end = Date.parse(interval.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{ start: new Date(start).toISOString(), end: new Date(end).toISOString() }];
  });
  return { authorizationRequired: false, busy };
}
