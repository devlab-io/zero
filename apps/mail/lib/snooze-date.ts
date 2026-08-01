import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

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

/**
 * Arithmétique CIVILE de fuseau (P10). Sans `timeZone`, tout se calcule dans
 * le fuseau local du navigateur (comportement historique intact). Avec un
 * fuseau IANA explicite (réglage utilisateur), les « jours » sont des jours
 * CIVILS de CE fuseau : « demain 8h » tombe à 8h murale même à travers un
 * changement d'heure (fromZonedTime résout l'heure murale → instant absolu).
 */
type Zone = string | undefined;

/** Une zone IANA invalide lève RangeError chez Intl/date-fns-tz — valider AVANT. */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Trou DST (heure murale inexistante) : fromZonedTime résout sans erreur —
 * le round-trip toZonedTime révèle des champs civils DIFFÉRENTS de la
 * demande. On collecte ce décalage dans `flags.adjusted` pour l'afficher
 * (jamais de validation silencieuse). Pour une heure AMBIGUË (fin de DST),
 * date-fns-tz 3.x choisit l'offset POSTÉRIEUR : la preview absolue (offset
 * inclus) montre cette résolution déterministe.
 */
type AdjustFlags = { adjusted: boolean };

const checkWallRoundTrip = (
  instant: Date,
  timeZone: Zone,
  wanted: { day?: number; hours: number; minutes: number },
  flags?: AdjustFlags,
) => {
  if (!timeZone || !flags) return instant;
  const back = toZonedTime(instant, timeZone);
  if (
    back.getHours() !== wanted.hours ||
    back.getMinutes() !== wanted.minutes ||
    (wanted.day !== undefined && back.getDate() !== wanted.day)
  ) {
    flags.adjusted = true;
  }
  return instant;
};

/** Preview ABSOLUE : date complète + offset/abréviation de la zone effective. */
export const formatSnoozePreview = (date: Date, timeZone?: string): string => {
  if (timeZone && isValidTimeZone(timeZone)) {
    return formatInTimeZone(date, timeZone, 'EEE d MMM yyyy, HH:mm (zzz)');
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
};

const toWall = (date: Date, timeZone: Zone) =>
  timeZone ? toZonedTime(date, timeZone) : new Date(date);

const fromWall = (wall: Date, timeZone: Zone) =>
  timeZone ? fromZonedTime(wall, timeZone) : new Date(wall);

const atWallTime = (
  date: Date,
  timeZone: Zone,
  hours: number,
  minutes = 0,
  flags?: AdjustFlags,
) => {
  const wall = toWall(date, timeZone);
  wall.setHours(hours, minutes, 0, 0);
  const wantedDay = wall.getDate();
  return checkWallRoundTrip(
    fromWall(wall, timeZone),
    timeZone,
    { day: wantedDay, hours, minutes },
    flags,
  );
};

/** Jours CIVILS : même heure murale N jours plus tard — jamais N × 24 h. */
const addCivilDays = (date: Date, timeZone: Zone, days: number) => {
  const wall = toWall(date, timeZone);
  wall.setDate(wall.getDate() + days);
  return fromWall(wall, timeZone);
};

const wallWeekday = (date: Date, timeZone: Zone) => toWall(date, timeZone).getDay();

const nextWeekday = (
  reference: Date,
  timeZone: Zone,
  weekday: number,
  hours: number,
  minutes = 0,
  flags?: AdjustFlags,
) => {
  const daysAhead = (weekday - wallWeekday(reference, timeZone) + 7) % 7 || 7;
  return atWallTime(addCivilDays(reference, timeZone, daysAhead), timeZone, hours, minutes, flags);
};

export function buildSnoozePresets(reference = new Date(), timeZone?: string): SnoozePreset[] {
  const inOneHour = new Date(reference.getTime() + 60 * 60 * 1000);
  let later = atWallTime(reference, timeZone, 17);
  let laterLabel = 'Later today';
  if (later.getTime() <= reference.getTime() + 30 * 60 * 1000) {
    later = atWallTime(addCivilDays(reference, timeZone, 1), timeZone, 17);
    laterLabel = 'Tomorrow evening';
  }

  const tomorrow = addCivilDays(reference, timeZone, 1);
  const oneMonthWall = toWall(reference, timeZone);
  oneMonthWall.setMonth(oneMonthWall.getMonth() + 1);
  oneMonthWall.setHours(8, 0, 0, 0);
  const inOneMonth = fromWall(oneMonthWall, timeZone);

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
      wakeAt: atWallTime(tomorrow, timeZone, 8),
    },
    {
      id: 'tomorrow-afternoon',
      label: 'Tomorrow afternoon',
      hint: 'At 1:00 PM',
      shortcut: '4',
      wakeAt: atWallTime(tomorrow, timeZone, 13),
    },
    {
      id: 'weekend',
      label: 'This weekend',
      hint: 'Saturday at 9:00 AM',
      shortcut: '5',
      wakeAt: nextWeekday(reference, timeZone, 6, 9),
    },
    {
      id: 'next-week',
      label: 'Next week',
      hint: 'Monday at 8:00 AM',
      shortcut: '6',
      wakeAt: nextWeekday(reference, timeZone, 1, 8),
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
  value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

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
 * browser. English and French are both accepted. `timeZone` (IANA) interprets
 * the expression in the USER's zone — days are civil days of that zone (DST
 * included); minutes/hours remain true elapsed durations.
 */
export function parseSnoozeExpression(
  value: string,
  reference = new Date(),
  timeZone?: string,
): Date | null {
  return resolveSnoozeExpression(value, reference, timeZone)?.wakeAt ?? null;
}

export type SnoozeResolution = {
  wakeAt: Date;
  /**
   * true = l'heure murale demandée n'existe pas telle quelle dans la zone
   * (trou DST, jour recalé) — fromZonedTime a résolu ; l'UI DOIT montrer la
   * résolution (preview absolue avec offset), jamais valider en silence.
   */
  adjusted: boolean;
};

export function resolveSnoozeExpression(
  value: string,
  reference = new Date(),
  timeZone?: string,
): SnoozeResolution | null {
  const expression = normalizeExpression(value);
  if (!expression) return null;
  const flags: AdjustFlags = { adjusted: false };
  const wakeAt = resolveExpressionInstant(expression, reference, timeZone, flags);
  return wakeAt ? { wakeAt, adjusted: flags.adjusted } : null;
}

function resolveExpressionInstant(
  expression: string,
  reference: Date,
  timeZone: Zone,
  flags: AdjustFlags,
): Date | null {
  const dayWithOptionalTime = (base: Date, timeExpression: string, defaultHours: number) => {
    const time = timeExpression ? parseClock(timeExpression) : null;
    if (timeExpression && !time) return null;
    return atWallTime(base, timeZone, time?.hours ?? defaultHours, time?.minutes ?? 0, flags);
  };

  const duration = expression.match(
    /^(?:(?:in|dans)\s+)?(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?|heures?|j|jours?|days?|w|weeks?|sem|semaines?)$/,
  );
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2];
    if (amount <= 0) return null;
    if (unit.startsWith('m') && unit !== 'mois') {
      return new Date(reference.getTime() + amount * 60 * 1000);
    }
    if (unit.startsWith('h')) {
      return new Date(reference.getTime() + amount * 60 * 60 * 1000);
    }
    // Jours/semaines : jours CIVILS (même heure murale), pas des blocs de
    // 24 h — un changement d'heure ne décale plus le réveil.
    const days =
      unit === 'j' || unit.startsWith('jour') || unit.startsWith('day') ? amount : amount * 7;
    const wall = toWall(reference, timeZone);
    return checkWallRoundTrip(
      addCivilDays(reference, timeZone, days),
      timeZone,
      { hours: wall.getHours(), minutes: wall.getMinutes() },
      flags,
    );
  }

  if (/^(eod|end of day|fin de journee)$/.test(expression)) {
    const today = atWallTime(reference, timeZone, 17, 0, flags);
    return today > reference
      ? today
      : atWallTime(addCivilDays(reference, timeZone, 1), timeZone, 17, 0, flags);
  }
  if (/^(this evening|ce soir)$/.test(expression)) {
    const today = atWallTime(reference, timeZone, 18, 0, flags);
    return today > reference
      ? today
      : atWallTime(addCivilDays(reference, timeZone, 1), timeZone, 18, 0, flags);
  }
  if (/^(noon|midi)$/.test(expression)) {
    const today = atWallTime(reference, timeZone, 12, 0, flags);
    return today > reference
      ? today
      : atWallTime(addCivilDays(reference, timeZone, 1), timeZone, 12, 0, flags);
  }
  if (/^(midnight|minuit)$/.test(expression)) {
    return atWallTime(addCivilDays(reference, timeZone, 1), timeZone, 0, 0, flags);
  }
  if (/^(next week|semaine prochaine)$/.test(expression)) {
    return nextWeekday(reference, timeZone, 1, 8, 0, flags);
  }
  if (/^(this weekend|ce weekend|weekend)$/.test(expression)) {
    return nextWeekday(reference, timeZone, 6, 9, 0, flags);
  }

  const relativeToday = expression.match(/^(today|aujourd['’]?hui|aujourdhui)(?:\s+(.*))?$/);
  if (relativeToday) {
    const result = dayWithOptionalTime(reference, relativeToday[2] ?? '', 17);
    return result ? futureOrNull(result, reference) : null;
  }

  const relativeDay = expression.match(/^(tomorrow|demain)(?:\s+(.*))?$/);
  if (relativeDay) {
    const result = dayWithOptionalTime(
      addCivilDays(reference, timeZone, 1),
      relativeDay[2] ?? '',
      8,
    );
    return result ? futureOrNull(result, reference) : null;
  }

  const weekday = expression.match(
    /^(?:(?:next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\s+(?:prochain|prochaine))?(?:\s+(.*))?$/,
  );
  if (weekday) {
    const target = weekdays[weekday[1]];
    const base = nextWeekday(reference, timeZone, target, 8, 0, flags);
    const result = dayWithOptionalTime(base, weekday[2] ?? '', 8);
    return result ? futureOrNull(result, reference) : null;
  }

  const isoDate = expression.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t]+(.+))?$/);
  if (isoDate) {
    const base = civilDate(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3]),
      timeZone,
    );
    const result = dayWithOptionalTime(base, isoDate[4] ?? '', 8);
    return result ? futureOrNull(result, reference) : null;
  }

  const europeanDate = expression.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/);
  if (europeanDate) {
    const base = civilDate(
      Number(europeanDate[3]),
      Number(europeanDate[2]) - 1,
      Number(europeanDate[1]),
      timeZone,
    );
    const result = dayWithOptionalTime(base, europeanDate[4] ?? '', 8);
    return result ? futureOrNull(result, reference) : null;
  }

  const clock = parseClock(expression);
  if (clock) {
    const today = atWallTime(reference, timeZone, clock.hours, clock.minutes, flags);
    return today > reference
      ? today
      : atWallTime(
          addCivilDays(reference, timeZone, 1),
          timeZone,
          clock.hours,
          clock.minutes,
          flags,
        );
  }

  return null;
}

/** Date calendaire (année/mois/jour) exprimée dans le fuseau demandé. */
const civilDate = (year: number, monthIndex: number, day: number, timeZone: Zone) => {
  if (!timeZone) return new Date(year, monthIndex, day);
  const wall = new Date(year, monthIndex, day, 0, 0, 0, 0);
  return fromZonedTime(wall, timeZone);
};
