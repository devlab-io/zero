export type CalendarDraftProvider = 'google' | 'outlook';

export type CalendarDraftInput = {
  provider: CalendarDraftProvider;
  subject: string;
  context: string;
  startsAt: Date;
  durationMinutes: number;
  timeZone: string;
  guests: readonly string[];
  videoRequested: boolean;
};

const compactUtc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const safeGuests = (guests: readonly string[]) =>
  [...new Set(guests.map((email) => email.trim().toLowerCase()))].filter(
    (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
  );

export function buildCalendarDraftUrl(input: CalendarDraftInput): string {
  if (Number.isNaN(input.startsAt.getTime())) throw new Error('Invalid meeting start');
  if (input.durationMinutes < 15 || input.durationMinutes > 480) {
    throw new Error('Invalid meeting duration');
  }

  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
  const guests = safeGuests(input.guests);
  const videoNote = input.videoRequested
    ? '\n\nVideo conference requested — add a meeting link before saving.'
    : '';
  const details = `${input.context.trim()}${videoNote}`.trim();

  if (input.provider === 'outlook') {
    const url = new URL('https://outlook.office.com/calendar/0/deeplink/compose');
    url.searchParams.set('path', '/calendar/action/compose');
    url.searchParams.set('rru', 'addevent');
    url.searchParams.set('subject', input.subject.trim());
    url.searchParams.set('startdt', input.startsAt.toISOString());
    url.searchParams.set('enddt', endsAt.toISOString());
    url.searchParams.set('body', details);
    if (guests.length) url.searchParams.set('to', guests.join(','));
    return url.toString();
  }

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', input.subject.trim());
  url.searchParams.set('dates', `${compactUtc(input.startsAt)}/${compactUtc(endsAt)}`);
  url.searchParams.set('details', details);
  url.searchParams.set('ctz', input.timeZone);
  for (const guest of guests) url.searchParams.append('add', guest);
  return url.toString();
}
