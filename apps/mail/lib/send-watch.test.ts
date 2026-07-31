import {
  planSendWatch,
  sendWatchAction,
  SEND_WATCH_MAX_LEAD_MS,
  SEND_WATCH_POLL_DELAYS_MS,
} from './send-watch';
import { describe, expect, it } from 'vitest';

describe('planSendWatch', () => {
  const now = 1_700_000_000_000;

  it('envoi immédiat (pas de sendAt) → jalons de base', () => {
    expect(planSendWatch(undefined, now)).toEqual([...SEND_WATCH_POLL_DELAYS_MS]);
  });

  it('fenêtre undo (sendAt +15 s) → jalons décalés après l’échéance', () => {
    const delays = planSendWatch(now + 15_000, now);
    expect(delays).toEqual(SEND_WATCH_POLL_DELAYS_MS.map((d) => d + 15_000));
  });

  it('sendAt déjà passé (relivraison, horloge) → pas de décalage négatif', () => {
    expect(planSendWatch(now - 5_000, now)).toEqual([...SEND_WATCH_POLL_DELAYS_MS]);
  });

  it('planifié long terme (> avance max) → pas de suivi post-composer', () => {
    expect(planSendWatch(now + SEND_WATCH_MAX_LEAD_MS + 1, now)).toBeNull();
    expect(planSendWatch(now + 13 * 3600 * 1000, now)).toBeNull();
  });
});

describe('sendWatchAction', () => {
  it('sent/cancelled arrêtent, failed alerte, le reste continue', () => {
    expect(sendWatchAction('sent')).toBe('stop');
    expect(sendWatchAction('cancelled')).toBe('stop');
    expect(sendWatchAction('failed')).toBe('alert');
    expect(sendWatchAction('queued')).toBe('continue');
    expect(sendWatchAction('sending')).toBe('continue');
    expect(sendWatchAction('unknown')).toBe('continue');
  });
});
