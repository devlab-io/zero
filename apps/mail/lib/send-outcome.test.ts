import { interpretSendOutcome } from './send-outcome';
import { describe, expect, it } from 'vitest';

describe('interpretSendOutcome', () => {
  it('passes through resolved sends, queued or immediate', () => {
    expect(interpretSendOutcome({ success: true })).toEqual({
      ok: true,
      result: { success: true },
    });
    const queued = { success: true, queued: true, messageId: 'm1', sendAt: 123 };
    expect(interpretSendOutcome(queued)).toEqual({ ok: true, result: queued });
  });

  it('turns an explicit success:false payload into a failure (no silent loss)', () => {
    expect(interpretSendOutcome({ success: false, error: 'Failed to enqueue email send' })).toEqual(
      {
        ok: false,
        error: 'Failed to enqueue email send',
      },
    );
    expect(interpretSendOutcome({ success: false })).toEqual({ ok: false, error: undefined });
  });

  it('leaves non-object and legacy results as success', () => {
    expect(interpretSendOutcome(undefined).ok).toBe(true);
    expect(interpretSendOutcome(null).ok).toBe(true);
    expect(interpretSendOutcome('ok').ok).toBe(true);
  });
});
