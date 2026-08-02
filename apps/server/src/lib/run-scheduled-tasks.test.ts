import { runScheduledTasksIsolated } from './run-scheduled-tasks';
import { describe, expect, it, vi } from 'vitest';

describe('runScheduledTasksIsolated — le cron n’a pas de maillon faible', () => {
  it('une tâche en échec ne prive JAMAIS les suivantes (le sweep P18 tourne toujours)', async () => {
    const order: string[] = [];
    const log = vi.fn();
    const result = await runScheduledTasksIsolated(
      [
        [
          'scheduled-emails',
          async () => {
            order.push('emails');
            throw new Error('kv down');
          },
        ],
        [
          'expired-subscriptions',
          async () => {
            order.push('subs');
            throw new Error('billing down');
          },
        ],
        [
          'team-outbound-sweep',
          async () => {
            order.push('outbound');
          },
        ],
      ],
      log,
    );
    expect(order).toEqual(['emails', 'subs', 'outbound']);
    expect(result).toEqual({
      ran: ['team-outbound-sweep'],
      failed: ['scheduled-emails', 'expired-subscriptions'],
    });
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('scheduled-emails', expect.any(Error));
  });

  it('ordre séquentiel préservé, aucun échec = aucun log', async () => {
    const log = vi.fn();
    const result = await runScheduledTasksIsolated(
      [
        ['a', async () => {}],
        ['b', async () => {}],
      ],
      log,
    );
    expect(result).toEqual({ ran: ['a', 'b'], failed: [] });
    expect(log).not.toHaveBeenCalled();
  });
});
