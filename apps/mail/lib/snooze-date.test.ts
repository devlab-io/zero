import {
  buildSnoozePresets,
  formatSnoozePreview,
  isValidTimeZone,
  parseSnoozeExpression,
  resolveSnoozeExpression,
} from './snooze-date';
import { describe, expect, it } from 'vitest';

const expectLocalDate = (date: Date | null, expected: [number, number, number, number, number]) => {
  expect(date).not.toBeNull();
  expect([
    date?.getFullYear(),
    date ? date.getMonth() + 1 : undefined,
    date?.getDate(),
    date?.getHours(),
    date?.getMinutes(),
  ]).toEqual(expected);
};

describe('buildSnoozePresets', () => {
  it('builds useful future triage choices from the current local time', () => {
    const reference = new Date(2026, 7, 3, 10, 30); // Monday
    const presets = buildSnoozePresets(reference);

    expect(presets.map((preset) => preset.id)).toEqual([
      'one-hour',
      'later-today',
      'tomorrow-morning',
      'tomorrow-afternoon',
      'weekend',
      'next-week',
      'one-month',
    ]);
    expectLocalDate(presets[0].wakeAt, [2026, 8, 3, 11, 30]);
    expectLocalDate(presets[1].wakeAt, [2026, 8, 3, 17, 0]);
    expectLocalDate(presets[2].wakeAt, [2026, 8, 4, 8, 0]);
    expectLocalDate(presets[4].wakeAt, [2026, 8, 8, 9, 0]);
    expectLocalDate(presets[5].wakeAt, [2026, 8, 10, 8, 0]);
  });

  it('rolls the evening suggestion forward when the day is already over', () => {
    const [oneHour, later] = buildSnoozePresets(new Date(2026, 7, 3, 18));
    expectLocalDate(oneHour.wakeAt, [2026, 8, 3, 19, 0]);
    expect(later.label).toBe('Tomorrow evening');
    expectLocalDate(later.wakeAt, [2026, 8, 4, 17, 0]);
  });
});

describe('parseSnoozeExpression', () => {
  const reference = new Date(2026, 7, 3, 10, 30); // Monday

  it.each([
    ['dans 2h', [2026, 8, 3, 12, 30]],
    ['in 45 minutes', [2026, 8, 3, 11, 15]],
    ['tomorrow 9:30', [2026, 8, 4, 9, 30]],
    ['demain 14h', [2026, 8, 4, 14, 0]],
    ["aujourd'hui 14h00", [2026, 8, 3, 14, 0]],
    ['mardi 14h00', [2026, 8, 4, 14, 0]],
    ['next Friday 2pm', [2026, 8, 7, 14, 0]],
    ['vendredi prochain 9h', [2026, 8, 7, 9, 0]],
    ['next week', [2026, 8, 10, 8, 0]],
    ['ce weekend', [2026, 8, 8, 9, 0]],
    ['2026-08-12 16:15', [2026, 8, 12, 16, 15]],
    ['12/08/2026 16h15', [2026, 8, 12, 16, 15]],
  ] as const)('parses %s locally without an AI call', (expression, expected) => {
    expectLocalDate(parseSnoozeExpression(expression, reference), [...expected]);
  });

  it('moves a bare past clock to tomorrow', () => {
    expectLocalDate(parseSnoozeExpression('9am', reference), [2026, 8, 4, 9, 0]);
  });

  it('rejects invalid or past absolute dates', () => {
    expect(parseSnoozeExpression('whenever feels right', reference)).toBeNull();
    expect(parseSnoozeExpression('2026-07-01 9am', reference)).toBeNull();
    expect(parseSnoozeExpression('0 hours', reference)).toBeNull();
  });
});

// --- P10 : matrice de fuseaux IANA / DST -----------------------------------
// NZ 2026 : passage à l'heure d'été le dimanche 27 septembre (02:00→03:00),
// retour le dimanche 5 avril (03:00→02:00). Tahiti : -10 fixe, sans DST.

describe('parseSnoozeExpression — jours CIVILS dans une zone IANA (DST)', () => {
  // 26 sept 2026 08:00 NZST (+12) = 25 sept 20:00 UTC.
  const beforeSpringForward = new Date(Date.UTC(2026, 8, 25, 20, 0));

  it('« demain 8h » à Auckland traverse le début du DST : 08:00 murale NZDT (+13)', () => {
    const result = parseSnoozeExpression('demain 8h', beforeSpringForward, 'Pacific/Auckland');
    expect(result?.getTime()).toBe(Date.UTC(2026, 8, 26, 19, 0));
  });

  it('« dans 1 jour » = jour CIVIL (même heure murale), pas 24 h fixes', () => {
    const result = parseSnoozeExpression('dans 1 jour', beforeSpringForward, 'Pacific/Auckland');
    // 27 sept 08:00 NZDT = 26 sept 19:00 UTC — 23 h écoulées, pas 24.
    expect(result?.getTime()).toBe(Date.UTC(2026, 8, 26, 19, 0));
  });

  it('« dans 2 h » reste une durée ABSOLUE, même à travers la transition', () => {
    // 27 sept 01:30 NZST = 26 sept 13:30 UTC ; +2 h réelles = 15:30 UTC.
    const nearTransition = new Date(Date.UTC(2026, 8, 26, 13, 30));
    const result = parseSnoozeExpression('dans 2h', nearTransition, 'Pacific/Auckland');
    expect(result?.getTime()).toBe(Date.UTC(2026, 8, 26, 15, 30));
  });

  it('trou DST (02:30 inexistant le 27 sept) : résolution marquée adjusted, jamais silencieuse', () => {
    const resolution = resolveSnoozeExpression(
      'demain 2:30',
      beforeSpringForward,
      'Pacific/Auckland',
    );
    expect(resolution).not.toBeNull();
    expect(resolution!.adjusted).toBe(true);
    expect(formatSnoozePreview(resolution!.wakeAt, 'Pacific/Auckland')).not.toContain('02:30');
  });

  it('heure AMBIGUË (02:30 le 5 avril, fin DST) : résolution DÉTERMINISTE, non adjusted, offset visible en preview', () => {
    // 4 avril 2026 10:00 NZDT = 3 avril 21:00 UTC.
    const beforeFallBack = new Date(Date.UTC(2026, 3, 3, 21, 0));
    const resolution = resolveSnoozeExpression('demain 2:30', beforeFallBack, 'Pacific/Auckland');
    expect(resolution).not.toBeNull();
    // Mesuré sur date-fns-tz 3.x : l'ambiguïté est résolue vers l'offset
    // POSTÉRIEUR (NZST +12 → 14:30 UTC), pas l'antérieur — comportement figé
    // ici ; la preview absolue (offset inclus) montre la résolution retenue.
    expect(resolution!.wakeAt.getTime()).toBe(Date.UTC(2026, 3, 4, 14, 30));
    expect(resolution!.adjusted).toBe(false);
    expect(formatSnoozePreview(resolution!.wakeAt, 'Pacific/Auckland')).toMatch(
      /UTC\+12|GMT\+12|NZST/,
    );
  });

  it('Pacific/Tahiti (-10 fixe) : « demain 8h » = 18:00 UTC, jamais adjusted', () => {
    // 1er août 2026 09:00 à Tahiti = 19:00 UTC.
    const reference = new Date(Date.UTC(2026, 7, 1, 19, 0));
    const resolution = resolveSnoozeExpression('demain 8h', reference, 'Pacific/Tahiti');
    expect(resolution!.wakeAt.getTime()).toBe(Date.UTC(2026, 7, 2, 18, 0));
    expect(resolution!.adjusted).toBe(false);
  });
});

describe('isValidTimeZone / formatSnoozePreview', () => {
  it('valide les zones IANA et refuse le reste (RangeError contenu)', () => {
    expect(isValidTimeZone('Pacific/Auckland')).toBe(true);
    expect(isValidTimeZone('Pacific/Tahiti')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('preview ABSOLUE : date complète + offset de la zone effective', () => {
    const date = new Date(Date.UTC(2026, 8, 26, 19, 0));
    const preview = formatSnoozePreview(date, 'Pacific/Auckland');
    expect(preview).toContain('27');
    expect(preview).toContain('08:00');
    expect(preview).toMatch(/UTC\+13|GMT\+13|NZDT/);
  });

  it('zone invalide → repli local sans lever', () => {
    expect(() => formatSnoozePreview(new Date(), 'Mars/Olympus')).not.toThrow();
  });
});
