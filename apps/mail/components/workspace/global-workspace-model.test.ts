import {
  calendarDayWindow,
  defaultEventWindow,
  positionCalendarEvents,
  safeSelectedDate,
} from './global-workspace-model';
import { describe, expect, it } from 'vitest';

describe('global workspace calendar model', () => {
  it('builds exactly one local civil day', () => {
    const day = new Date(2026, 7, 2, 12);
    const window = calendarDayWindow(day);
    expect(new Date(window.timeMax).getTime() - new Date(window.timeMin).getTime()).toBe(
      24 * 60 * 60_000,
    );
  });

  it('snaps the default event to the next half-hour for today', () => {
    const now = new Date(2026, 7, 2, 12, 11);
    const window = defaultEventWindow(now, now);
    expect(window.start.getHours()).toBe(12);
    expect(window.start.getMinutes()).toBe(30);
    expect(window.end.getTime() - window.start.getTime()).toBe(60 * 60_000);
  });

  it('lays overlapping events side by side but gives later groups full width', () => {
    const day = new Date(2026, 7, 2, 12);
    const event = (id: string, startHour: number, endHour: number) => ({
      id,
      title: id,
      allDay: false,
      start: new Date(2026, 7, 2, startHour).toISOString(),
      end: new Date(2026, 7, 2, endHour).toISOString(),
    });
    const positioned = positionCalendarEvents(
      [event('a', 8, 10), event('b', 9, 11), event('c', 14, 15)],
      day,
    );
    expect(positioned.find((item) => item.id === 'a')?.widthPercent).toBe(50);
    expect(positioned.find((item) => item.id === 'b')?.leftPercent).toBe(50);
    expect(positioned.find((item) => item.id === 'c')?.widthPercent).toBe(100);
  });

  it('falls back from an invalid date', () => {
    const fallback = new Date(2026, 7, 2, 12);
    expect(safeSelectedDate(new Date('invalid'), fallback).getDate()).toBe(2);
  });
});
