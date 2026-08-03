import { addDays, endOfDay, startOfDay } from 'date-fns';

export type WorkspaceTab = 'calendar' | 'activity' | 'contacts' | 'assistant';

export type CalendarPanelEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
};

export type PositionedCalendarEvent = CalendarPanelEvent & {
  topPercent: number;
  heightPercent: number;
  leftPercent: number;
  widthPercent: number;
};

export const CALENDAR_START_HOUR = 6;
export const CALENDAR_END_HOUR = 22;

export function calendarDayWindow(date: Date) {
  return {
    timeMin: startOfDay(date).toISOString(),
    timeMax: addDays(startOfDay(date), 1).toISOString(),
  };
}

export function defaultEventWindow(date: Date, now = new Date()) {
  const chosen = startOfDay(date);
  const today = startOfDay(now);
  const base = chosen.getTime() === today.getTime() ? new Date(now) : chosen;
  base.setMinutes(Math.ceil(base.getMinutes() / 30) * 30, 0, 0);
  if (base.getHours() < 8) base.setHours(8, 0, 0, 0);
  if (base.getHours() >= 20) base.setHours(20, 0, 0, 0);
  return { start: base, end: new Date(base.getTime() + 60 * 60_000) };
}

function minutesFromDayStart(value: string, day: Date) {
  const parsed = new Date(value);
  return (parsed.getTime() - startOfDay(day).getTime()) / 60_000;
}

/** Greedy interval coloring per overlap group — stable and deterministic. */
export function positionCalendarEvents(
  events: readonly CalendarPanelEvent[],
  day: Date,
): PositionedCalendarEvent[] {
  const dayStart = CALENDAR_START_HOUR * 60;
  const dayEnd = CALENDAR_END_HOUR * 60;
  const total = dayEnd - dayStart;
  const timed = events
    .filter((event) => !event.allDay)
    .map((event) => ({
      ...event,
      startMinute: Math.max(dayStart, minutesFromDayStart(event.start, day)),
      endMinute: Math.min(dayEnd, minutesFromDayStart(event.end, day)),
    }))
    .filter((event) => event.endMinute > dayStart && event.startMinute < dayEnd)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const output: PositionedCalendarEvent[] = [];
  let cursor = 0;
  while (cursor < timed.length) {
    const group = [timed[cursor]!];
    let groupEnd = timed[cursor]!.endMinute;
    let next = cursor + 1;
    while (next < timed.length && timed[next]!.startMinute < groupEnd) {
      group.push(timed[next]!);
      groupEnd = Math.max(groupEnd, timed[next]!.endMinute);
      next += 1;
    }

    const columnEnds: number[] = [];
    const assignments = group.map((event) => {
      let column = columnEnds.findIndex((end) => end <= event.startMinute);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = event.endMinute;
      return { event, column };
    });
    const columns = Math.max(columnEnds.length, 1);
    for (const { event, column } of assignments) {
      output.push({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: false,
        topPercent: ((event.startMinute - dayStart) / total) * 100,
        heightPercent: Math.max(((event.endMinute - event.startMinute) / total) * 100, 2.4),
        leftPercent: (column / columns) * 100,
        widthPercent: 100 / columns,
      });
    }
    cursor = next;
  }
  return output;
}

export function safeSelectedDate(date: Date | undefined, fallback = new Date()) {
  if (!date || !Number.isFinite(date.getTime())) return startOfDay(fallback);
  return startOfDay(date > endOfDay(addDays(fallback, 365 * 5)) ? fallback : date);
}
