import { buildCalendarDraftUrl } from './meeting-deeplink';
import { describe, expect, it } from 'vitest';

const base = {
  subject: 'RDV — Devis Socredo',
  context: 'Relire le devis avant le rendez-vous.',
  startsAt: new Date('2026-08-04T02:00:00.000Z'),
  durationMinutes: 30,
  timeZone: 'Pacific/Tahiti',
  guests: ['client@ext.pf', 'CLIENT@ext.pf', 'invalid'],
  videoRequested: true,
} as const;

describe('buildCalendarDraftUrl — preview only, no Calendar API mutation', () => {
  it('builds a Google draft with exact UTC bounds, zone and deduplicated guests', () => {
    const url = new URL(buildCalendarDraftUrl({ ...base, provider: 'google' }));
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('dates')).toBe('20260804T020000Z/20260804T023000Z');
    expect(url.searchParams.get('ctz')).toBe('Pacific/Tahiti');
    expect(url.searchParams.getAll('add')).toEqual(['client@ext.pf']);
    expect(url.searchParams.get('details')).toContain('add a meeting link before saving');
  });

  it('builds an Outlook compose draft without creating or sending anything', () => {
    const url = new URL(buildCalendarDraftUrl({ ...base, provider: 'outlook' }));
    expect(url.origin).toBe('https://outlook.office.com');
    expect(url.searchParams.get('rru')).toBe('addevent');
    expect(url.searchParams.get('startdt')).toBe('2026-08-04T02:00:00.000Z');
    expect(url.searchParams.get('enddt')).toBe('2026-08-04T02:30:00.000Z');
    expect(url.searchParams.get('to')).toBe('client@ext.pf');
  });

  it('rejects invalid starts and unsafe durations', () => {
    expect(() =>
      buildCalendarDraftUrl({ ...base, provider: 'google', startsAt: new Date('invalid') }),
    ).toThrow('Invalid meeting start');
    expect(() =>
      buildCalendarDraftUrl({ ...base, provider: 'google', durationMinutes: 5 }),
    ).toThrow('Invalid meeting duration');
  });
});
