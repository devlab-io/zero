import { buildSnoozePresets, parseSnoozeExpression } from './snooze-date';
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
