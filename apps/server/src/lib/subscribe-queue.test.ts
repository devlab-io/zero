import { renewWatchSubscription } from './subscribe-queue';
import { describe, expect, it, vi } from 'vitest';

const silentLogger = { error: vi.fn() };

describe('renewWatchSubscription — le watch Gmail ne peut plus echouer en silence (P3)', () => {
  it('un echec de renouvellement REJOUE le message au lieu de l’acquitter', async () => {
    const retry = vi.fn();
    const out = await renewWatchSubscription(
      { connectionId: 'conn-1', providerId: 'google' },
      {
        enable: vi.fn(async () => {
          throw new Error('gmail watch 503');
        }),
        retry,
        logger: silentLogger,
      },
    );

    expect(out).toMatchObject({ outcome: 'retried' });
    // La regression exacte : le consommateur journalisait puis ne faisait rien, le message
    // etait ACQUITTE, le watch jamais renouvele, et la boite cessait de recevoir le push.
    expect(retry).toHaveBeenCalledTimes(1);
    expect(silentLogger.error).toHaveBeenCalled();
  });

  it('un renouvellement reussi ne rejoue pas', async () => {
    const retry = vi.fn();
    const enable = vi.fn(async () => ({}));
    const out = await renewWatchSubscription(
      { connectionId: 'conn-2', providerId: 'google' },
      { enable, retry, logger: silentLogger },
    );

    expect(out).toEqual({ outcome: 'renewed' });
    expect(enable).toHaveBeenCalledWith({ id: 'conn-2', providerId: 'google' });
    expect(retry).not.toHaveBeenCalled();
  });

  it('l’absence de fonction de rejeu ne fait pas lever le handler', async () => {
    await expect(
      renewWatchSubscription(
        { connectionId: 'conn-3', providerId: 'google' },
        {
          enable: vi.fn(async () => {
            throw new Error('boom');
          }),
          logger: silentLogger,
        },
      ),
    ).resolves.toMatchObject({ outcome: 'retried' });
  });
});
