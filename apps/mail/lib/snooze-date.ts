export type SnoozePresetId =
  | 'one-hour'
  | 'later-today'
  | 'tomorrow-morning'
  | 'tomorrow-afternoon'
  | 'weekend'
  | 'next-week'
  | 'one-month';

export type SnoozePreset = {
  id: SnoozePresetId;
  label: string;
  hint: string;
  shortcut: string;
  wakeAt: Date;
};

const atLocalTime = (date: Date, hours: number, minutes = 0) => {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const nextWeekday = (reference: Date, weekday: number, hours: number, minutes = 0) => {
  const daysAhead = (weekday - reference.getDay() + 7) % 7 || 7;
  return atLocalTime(addDays(reference, daysAhead), hours, minutes);
};

export function buildSnoozePresets(reference = new Date()): SnoozePreset[] {
  const inOneHour = new Date(reference.getTime() + 60 * 60 * 1000);
  let later = atLocalTime(reference, 17);
  let laterLabel = 'Later today';
  if (later.getTime() <= reference.getTime() + 30 * 60 * 1000) {
    later = atLocalTime(addDays(reference, 1), 17);
    laterLabel = 'Tomorrow evening';
  }

  const tomorrow = addDays(reference, 1);
  const inOneMonth = new Date(reference);
  inOneMonth.setMonth(inOneMonth.getMonth() + 1);
  inOneMonth.setHours(8, 0, 0, 0);

  return [
    {
      id: 'one-hour',
      label: 'In one hour',
      hint: 'A short pause',
      shortcut: '1',
      wakeAt: inOneHour,
    },
    {
      id: 'later-today',
      label: laterLabel,
      hint: 'At 5:00 PM',
      shortcut: '2',
      wakeAt: later,
    },
    {
      id: 'tomorrow-morning',
      label: 'Tomorrow morning',
      hint: 'At 8:00 AM',
      shortcut: '3',
      wakeAt: atLocalTime(tomorrow, 8),
    },
    {
      id: 'tomorrow-afternoon',
      label: 'Tomorrow afternoon',
      hint: 'At 1:00 PM',
      shortcut: '4',
      wakeAt: atLocalTime(tomorrow, 13),
    },
    {
      id: 'weekend',
      label: 'This weekend',
      hint: 'Saturday at 9:00 AM',
      shortcut: '5',
      wakeAt: nextWeekday(reference, 6, 9),
    },
    {
      id: 'next-week',
      label: 'Next week',
      hint: 'Monday at 8:00 AM',
      shortcut: '6',
      wakeAt: nextWeekday(reference, 1, 8),
    },
    {
      id: 'one-month',
      label: 'In one month',
      hint: 'At 8:00 AM',
      shortcut: '7',
      wakeAt: inOneMonth,
    },
  ];
}

const normalizeExpression = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const parseClock = (value: string): { hours: number; minutes: number } | null => {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d{1,2})(?:(?::(\d{1,2}))|h(\d{0,2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || match[3] || 0);
  const meridiem = match[4];
  if (minutes > 59 || hours > (meridiem ? 12 : 23) || hours < 0) return null;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return { hours, minutes };
};

const futureOrNull = (date: Date, reference: Date) =>
  Number.isNaN(date.getTime()) || date.getTime() <= reference.getTime() ? null : date;

const parseDayWithOptionalTime = (base: Date, timeExpression: string, defaultHours: number) => {
  const time = timeExpression ? parseClock(timeExpression) : null;
  if (timeExpression && !time) return null;
  return atLocalTime(base, time?.hours ?? defaultHours, time?.minutes ?? 0);
};

const weekdays: Record<string, number> = {
  sunday: 0,
  dimanche: 0,
  monday: 1,
  lundi: 1,
  tuesday: 2,
  mardi: 2,
  wednesday: 3,
  mercredi: 3,
  thursday: 4,
  jeudi: 4,
  friday: 5,
  vendredi: 5,
  saturday: 6,
  samedi: 6,
};

/**
 * Fast, deterministic natural-language parsing for the expressions used during
 * inbox triage. It deliberately stays local: no AI call and no date leaves the
 * browser. English and French are both accepted.
 */
export function parseSnoozeExpression(value: string, reference = new Date()): Date | null {
  const expression = normalizeExpression(value);
  if (!expression) return null;

  const duration = expression.match(
    /^(?:(?:in|dans)\s+)?(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?|heures?|j|jours?|days?|w|weeks?|sem|semaines?)$/,
  );
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2];
    const multiplier = unit.startsWith('m')
      ? 60 * 1000
      : unit.startsWith('h')
        ? 60 * 60 * 1000
        : unit === 'j' || unit.startsWith('jour') || unit.startsWith('day')
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
    return amount > 0 ? new Date(reference.getTime() + amount * multiplier) : null;
  }

  if (/^(eod|end of day|fin de journee)$/.test(expression)) {
    const today = atLocalTime(reference, 17);
    return today > reference ? today : atLocalTime(addDays(reference, 1), 17);
  }
  if (/^(this evening|ce soir)$/.test(expression)) {
    const today = atLocalTime(reference, 18);
    return today > reference ? today : atLocalTime(addDays(reference, 1), 18);
  }
  if (/^(noon|midi)$/.test(expression)) {
    const today = atLocalTime(reference, 12);
    return today > reference ? today : atLocalTime(addDays(reference, 1), 12);
  }
  if (/^(midnight|minuit)$/.test(expression)) return atLocalTime(addDays(reference, 1), 0);
  if (/^(next week|semaine prochaine)$/.test(expression)) {
    return nextWeekday(reference, 1, 8);
  }
  if (/^(this weekend|ce weekend|weekend)$/.test(expression)) {
    return nextWeekday(reference, 6, 9);
  }

  const relativeDay = expression.match(/^(tomorrow|demain)(?:\s+(.*))?$/);
  if (relativeDay) {
    const result = parseDayWithOptionalTime(addDays(reference, 1), relativeDay[2] ?? '', 8);
    return result ? futureOrNull(result, reference) : null;
  }

  const weekday = expression.match(
    /^(?:(?:next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\s+(?:prochain|prochaine))?(?:\s+(.*))?$/,
  );
  if (weekday) {
    const target = weekdays[weekday[1]];
    const base = nextWeekday(reference, target, 8);
    const result = parseDayWithOptionalTime(base, weekday[2] ?? '', 8);
    return result ? futureOrNull(result, reference) : null;
  }

  const isoDate = expression.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t]+(.+))?$/);
  if (isoDate) {
    const base = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
    const result = parseDayWithOptionalTime(base, isoDate[4] ?? '', 8);
    return result ? futureOrNull(result, reference) : null;
  }

  const europeanDate = expression.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/);
  if (europeanDate) {
    const base = new Date(
      Number(europeanDate[3]),
      Number(europeanDate[2]) - 1,
      Number(europeanDate[1]),
    );
    const result = parseDayWithOptionalTime(base, europeanDate[4] ?? '', 8);
    return result ? futureOrNull(result, reference) : null;
  }

  const clock = parseClock(expression);
  if (clock) {
    const today = atLocalTime(reference, clock.hours, clock.minutes);
    return today > reference
      ? today
      : atLocalTime(addDays(reference, 1), clock.hours, clock.minutes);
  }

  return null;
}
