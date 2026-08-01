import { describe, expect, it } from 'vitest';

// The middleware itself needs the hono context; the redaction contract is pure.
import { redactCallPayload } from './trpc-logging';

describe('redactCallPayload — mail/assistant content never reaches the log export', () => {
  it('replaces content-bearing payloads with an opaque size stub', () => {
    const input = { question: 'Que dit la relance Balguerie ?', draft: '<p>corps</p>' };
    const redacted = redactCallPayload('copilot.ask', input) as { redacted: boolean; size: number };
    expect(redacted.redacted).toBe(true);
    expect(redacted.size).toBe(JSON.stringify(input).length);
    expect(JSON.stringify(redacted)).not.toContain('Balguerie');
  });

  it.each(['ai.rewriteEmail', 'mail.get', 'drafts.create', 'notes.list', 'outbox.enqueue'])(
    'covers the content-bearing namespace %s',
    (path) => {
      expect(redactCallPayload(path, { body: 'secret' })).toMatchObject({ redacted: true });
    },
  );

  it('passes non-content procedures through untouched', () => {
    const input = { timezone: 'Pacific/Tahiti' };
    expect(redactCallPayload('settings.save', input)).toBe(input);
    expect(redactCallPayload('connections.list', undefined)).toBeUndefined();
  });
});
