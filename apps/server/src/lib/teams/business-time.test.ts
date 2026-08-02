import {
  businessMinutesBetween,
  businessSegments,
  localParts,
  zonedTimeToUtc,
  type BusinessWindow,
} from './business-time';
import { describe, expect, it } from 'vitest';

const paris: BusinessWindow = {
  timeZone: 'Europe/Paris',
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '17:00',
};
const tahiti: BusinessWindow = {
  timeZone: 'Pacific/Tahiti',
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '16:00',
};

const utc = (iso: string) => Date.parse(iso);

describe('zonedTimeToUtc / localParts', () => {
  it('round-trips a plain winter time in Paris (UTC+1)', () => {
    const ts = zonedTimeToUtc(
      { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
      'Europe/Paris',
    );
    expect(ts).toBe(utc('2026-01-15T08:00:00.000Z'));
    expect(localParts(ts, 'Europe/Paris')).toMatchObject({ hour: 9, minute: 0 });
  });

  it('round-trips a summer time in Paris (UTC+2) and a fixed-offset zone (Tahiti UTC-10)', () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 9, minute: 0 }, 'Europe/Paris'),
    ).toBe(utc('2026-07-15T07:00:00.000Z'));
    expect(
      zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 8, minute: 0 }, 'Pacific/Tahiti'),
    ).toBe(utc('2026-07-15T18:00:00.000Z'));
  });
});

describe('businessSegments — DST', () => {
  it('the spring-forward day (Paris, 2026-03-29 is a Sunday; Monday 30 is normal 8h)', () => {
    // Lundi 30 mars 2026, heure d'été : 09:00–17:00 locales = 07:00–15:00 UTC.
    const segments = businessSegments(
      utc('2026-03-30T00:00:00.000Z'),
      utc('2026-03-31T00:00:00.000Z'),
      paris,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      start: utc('2026-03-30T07:00:00.000Z'),
      end: utc('2026-03-30T15:00:00.000Z'),
    });
  });

  it('a window CROSSING the spring-forward hour loses the skipped hour', () => {
    // Dim 29 mars 2026 à Paris : 02:00→03:00 n'existe pas. Fenêtre 00:00–08:00
    // dimanche inclus → le segment UTC ne fait que 7 h.
    const sundayWindow: BusinessWindow = {
      timeZone: 'Europe/Paris',
      days: [0],
      start: '00:00',
      end: '08:00',
    };
    const minutes = businessMinutesBetween(
      utc('2026-03-28T20:00:00.000Z'),
      utc('2026-03-29T12:00:00.000Z'),
      sundayWindow,
    );
    expect(minutes).toBe(7 * 60);
  });

  it('a window crossing the fall-back hour gains the repeated hour (Paris, 2026-10-25)', () => {
    const sundayWindow: BusinessWindow = {
      timeZone: 'Europe/Paris',
      days: [0],
      start: '00:00',
      end: '08:00',
    };
    const minutes = businessMinutesBetween(
      utc('2026-10-24T20:00:00.000Z'),
      utc('2026-10-25T12:00:00.000Z'),
      sundayWindow,
    );
    expect(minutes).toBe(9 * 60);
  });

  it('weekend and off-hours count zero; a fixed-offset zone stays exact', () => {
    // Vendredi 31 juillet 2026 16:00 locale Tahiti → lundi 3 août 09:00 locale.
    const from = zonedTimeToUtc(
      { year: 2026, month: 7, day: 31, hour: 15, minute: 0 },
      tahiti.timeZone,
    );
    const to = zonedTimeToUtc(
      { year: 2026, month: 8, day: 3, hour: 9, minute: 0 },
      tahiti.timeZone,
    );
    // Vendredi 15:00→16:00 = 60 min ; samedi/dimanche 0 ; lundi 08:00→09:00 = 60 min.
    expect(businessMinutesBetween(from, to, tahiti)).toBe(120);
  });
});

describe('businessMinutesBetween — bornes et validations', () => {
  it('returns 0 for inverted ranges, empty days or inverted hours', () => {
    expect(businessMinutesBetween(2000, 1000, paris)).toBe(0);
    expect(businessMinutesBetween(0, 1000, { ...paris, days: [] })).toBe(0);
    expect(businessMinutesBetween(0, 1000, { ...paris, start: '17:00', end: '09:00' })).toBe(0);
  });

  it('clips segments to the requested range', () => {
    // Mercredi 15 juillet 2026 : plage demandée 10:00→11:30 locales Paris.
    const from = zonedTimeToUtc(
      { year: 2026, month: 7, day: 15, hour: 10, minute: 0 },
      paris.timeZone,
    );
    const to = zonedTimeToUtc(
      { year: 2026, month: 7, day: 15, hour: 11, minute: 30 },
      paris.timeZone,
    );
    expect(businessMinutesBetween(from, to, paris)).toBe(90);
  });

  it('a full business week in a stable zone totals 5 × 8h', () => {
    const from = zonedTimeToUtc(
      { year: 2026, month: 7, day: 13, hour: 0, minute: 0 },
      tahiti.timeZone,
    );
    const to = zonedTimeToUtc(
      { year: 2026, month: 7, day: 18, hour: 0, minute: 0 },
      tahiti.timeZone,
    );
    expect(businessMinutesBetween(from, to, tahiti)).toBe(5 * 8 * 60);
  });
});
