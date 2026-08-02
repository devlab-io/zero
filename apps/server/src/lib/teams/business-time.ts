import type { TeamBusinessHours } from './team-rules-shared';

/**
 * Temps OUVRÉ (P14 SLA / P16) — moteur pur, DST-safe, sans dépendance.
 *
 * Principe : plutôt que d'additionner des heures locales (fragile aux
 * transitions DST), on matérialise la fenêtre ouvrée en SEGMENTS UTC — un
 * par jour ouvré local — via une conversion locale→UTC par convergence
 * d'offset. Un jour de passage à l'heure d'été produit naturellement un
 * segment plus court (l'heure sautée n'existe pas en UTC), un passage à
 * l'heure d'hiver un segment plus long. Les agrégats par fil se réduisent
 * ensuite à des intersections d'intervalles — O(jours) par fil.
 *
 * Cas limites documentés : une heure locale INEXISTANTE (spring forward)
 * converge vers l'instant réel décalé ; une heure AMBIGUË (fall back)
 * converge déterministe vers l'une des deux occurrences. Pour un SLA en
 * minutes, l'écart maximal est d'une heure sur les deux jours de transition
 * de l'année — accepté et couvert par les tests.
 */

export type BusinessWindow = TeamBusinessHours & { timeZone: string };

const DAY_MS = 24 * 3_600_000;
const MAX_SEGMENT_DAYS = 120;

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Décomposition LOCALE d'un instant UTC dans une zone IANA. */
export function localParts(tsMs: number, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(tsMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
  // h23 peut produire '24' pour minuit sur certains runtimes — normalisé à 0.
  const rawHour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: get('minute'),
  };
}

/**
 * Instant UTC (ms) d'une heure CIVILE locale — convergence d'offset en deux
 * passes (suffisant pour tout offset réel, DST inclus).
 */
export function zonedTimeToUtc(
  civil: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): number {
  const target = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute);
  let ts = target;
  for (let pass = 0; pass < 2; pass++) {
    const local = localParts(ts, timeZone);
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    ts += target - localAsUtc;
  }
  return ts;
}

const toMinutes = (time: string): number => {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
};

export type UtcSegment = { start: number; end: number };

/**
 * Segments UTC des heures ouvrées couvrant [fromMs, toMs], bornés à
 * MAX_SEGMENT_DAYS jours civils (au-delà, la fenêtre est tronquée côté
 * appelant — P16 borne déjà à 90 jours).
 */
export function businessSegments(
  fromMs: number,
  toMs: number,
  window: BusinessWindow,
): UtcSegment[] {
  if (toMs <= fromMs) return [];
  const startMin = toMinutes(window.start);
  const endMin = toMinutes(window.end);
  if (endMin <= startMin || window.days.length === 0) return [];
  const days = new Set(window.days);

  const segments: UtcSegment[] = [];
  // Point de départ : la date CIVILE locale de fromMs, reculée d'un jour pour
  // couvrir un segment local ayant commencé la veille en UTC.
  const first = localParts(fromMs, window.timeZone);
  let cursor = Date.UTC(first.year, first.month - 1, first.day) - DAY_MS;
  for (let i = 0; i <= MAX_SEGMENT_DAYS; i++) {
    const civil = new Date(cursor);
    const civilDate = {
      year: civil.getUTCFullYear(),
      month: civil.getUTCMonth() + 1,
      day: civil.getUTCDate(),
    };
    // Le jour de semaine d'une date civile est indépendant de la zone.
    const weekday = civil.getUTCDay();
    if (days.has(weekday)) {
      const segStart = zonedTimeToUtc(
        { ...civilDate, hour: Math.floor(startMin / 60), minute: startMin % 60 },
        window.timeZone,
      );
      const segEnd = zonedTimeToUtc(
        { ...civilDate, hour: Math.floor(endMin / 60), minute: endMin % 60 },
        window.timeZone,
      );
      const clippedStart = Math.max(segStart, fromMs);
      const clippedEnd = Math.min(segEnd, toMs);
      if (clippedEnd > clippedStart) segments.push({ start: clippedStart, end: clippedEnd });
    }
    cursor += DAY_MS;
    if (cursor > toMs + DAY_MS) break;
  }
  return segments;
}

/** Minutes d'intersection entre [fromMs, toMs] et des segments UTC triés. */
export function overlapMinutes(segments: UtcSegment[], fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  let total = 0;
  for (const segment of segments) {
    const start = Math.max(segment.start, fromMs);
    const end = Math.min(segment.end, toMs);
    if (end > start) total += end - start;
    if (segment.start > toMs) break;
  }
  return Math.round(total / 60_000);
}

/** Minutes OUVRÉES écoulées entre deux instants. */
export function businessMinutesBetween(
  fromMs: number,
  toMs: number,
  window: BusinessWindow,
): number {
  return overlapMinutes(businessSegments(fromMs, toMs, window), fromMs, toMs);
}
