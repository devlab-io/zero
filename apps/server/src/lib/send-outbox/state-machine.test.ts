import {
  canCancelSendJob,
  canClaimSendJob,
  canRetrySendJob,
  isTerminalSendJobStatus,
  SENDING_LEASE_MS,
  sendJobStatuses,
} from './state-machine';
import { describe, expect, it } from 'vitest';

describe('send-outbox state machine', () => {
  const now = new Date('2026-07-31T12:00:00Z');

  it('queued et failed sont réclamables, sent/cancelled jamais', () => {
    expect(canClaimSendJob({ status: 'queued', updatedAt: now }, now)).toBe(true);
    expect(canClaimSendJob({ status: 'failed', updatedAt: now }, now)).toBe(true);
    expect(canClaimSendJob({ status: 'sent', updatedAt: now }, now)).toBe(false);
    expect(canClaimSendJob({ status: 'cancelled', updatedAt: now }, now)).toBe(false);
  });

  it('sending au bail frais est verrouillé ; au bail expiré, re-réclamable', () => {
    const fresh = new Date(now.getTime() - SENDING_LEASE_MS + 1_000);
    const stale = new Date(now.getTime() - SENDING_LEASE_MS - 1_000);
    expect(canClaimSendJob({ status: 'sending', updatedAt: fresh }, now)).toBe(false);
    expect(canClaimSendJob({ status: 'sending', updatedAt: stale }, now)).toBe(true);
  });

  it("l'annulation n'est permise que depuis queued/failed", () => {
    expect(canCancelSendJob('queued')).toBe(true);
    expect(canCancelSendJob('failed')).toBe(true);
    expect(canCancelSendJob('sending')).toBe(false);
    expect(canCancelSendJob('sent')).toBe(false);
    expect(canCancelSendJob('cancelled')).toBe(false);
  });

  it('le retry manuel ne part que de failed', () => {
    for (const status of sendJobStatuses) {
      expect(canRetrySendJob(status)).toBe(status === 'failed');
    }
  });

  it('sent et cancelled sont terminaux, les autres non', () => {
    expect(isTerminalSendJobStatus('sent')).toBe(true);
    expect(isTerminalSendJobStatus('cancelled')).toBe(true);
    expect(isTerminalSendJobStatus('queued')).toBe(false);
    expect(isTerminalSendJobStatus('sending')).toBe(false);
    expect(isTerminalSendJobStatus('failed')).toBe(false);
  });
});
