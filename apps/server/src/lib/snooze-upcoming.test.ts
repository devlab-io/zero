import { selectUpcomingSnoozes } from './snooze-upcoming';
import { describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-08-02T10:00:00Z');

describe('selectUpcomingSnoozes — compte sourcé, honnête', () => {
  it('ne compte que les réveils STRICTEMENT futurs et donne le prochain', async () => {
    const wakes: Record<string, string | null> = {
      t1: '2026-08-03T08:00:00.000Z',
      t2: '2026-08-01T08:00:00.000Z', // passé — en cours d'unsnooze, pas « à venir »
      t3: '2026-08-02T18:00:00.000Z',
      t4: null, // pas de clé KV — résidu de projection
    };
    const result = await selectUpcomingSnoozes(
      ['t1', 't2', 't3', 't4'],
      async (id) => wakes[id] ?? null,
      NOW,
      false,
    );
    expect(result).toEqual({
      count: 2,
      nextWakeAt: '2026-08-02T18:00:00.000Z',
      truncated: false,
    });
  });

  it('liste vide → zéro RÉEL (count 0, nextWakeAt null)', async () => {
    expect(await selectUpcomingSnoozes([], async () => null, NOW, false)).toEqual({
      count: 0,
      nextWakeAt: null,
      truncated: false,
    });
  });

  it('une lecture KV qui échoue est ignorée sans faire échouer le compte', async () => {
    const result = await selectUpcomingSnoozes(
      ['ok', 'boom'],
      async (id) => {
        if (id === 'boom') throw new Error('kv down');
        return '2026-08-03T08:00:00.000Z';
      },
      NOW,
      false,
    );
    expect(result.count).toBe(1);
  });

  it('wakeAt illisible ignoré ; troncature exposée telle quelle', async () => {
    const result = await selectUpcomingSnoozes(['t1'], async () => 'not-a-date', NOW, true);
    expect(result).toEqual({ count: 0, nextWakeAt: null, truncated: true });
  });
});
