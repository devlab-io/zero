import { describe, expect, it } from 'vitest';
import { buildSentryOptions, captureServerException, type SentryTransport } from './sentry';

type Env = Parameters<typeof buildSentryOptions>[0];

const envWithDsn = {
  NODE_ENV: 'local',
  SENTRY_DSN: 'https://abc123@o987.ingest.sentry.io/456',
  SENTRY_RELEASE: 'zero-server@test',
} as unknown as Env;

const envNoDsn = { NODE_ENV: 'local' } as unknown as Env;

describe('server sentry', () => {
  it('buildSentryOptions is a clean no-op (undefined) without a DSN', () => {
    expect(buildSentryOptions(envNoDsn)).toBeUndefined();
  });

  it('buildSentryOptions carries the dsn and a release tag when a DSN is set', () => {
    const o = buildSentryOptions(envWithDsn);
    expect(o?.dsn).toContain('o987.ingest.sentry.io');
    expect(o?.release).toBe('zero-server@test');
  });

  it('captures a test error to the transport with the release tag', async () => {
    const sent: { url: string; body: string }[] = [];
    const transport: SentryTransport = {
      send: async (url, body) => {
        sent.push({ url, body });
      },
    };
    const id = await captureServerException(
      new Error('SentryProofError'),
      envWithDsn,
      { transaction: 'GET /x' },
      transport,
    );
    expect(id).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://o987.ingest.sentry.io/api/456/envelope/');
    expect(sent[0].body).toContain('SentryProofError');
    expect(sent[0].body).toContain('zero-server@test');
    expect(sent[0].body).toContain('GET /x');
  });

  it('is a clean no-op (returns null, sends nothing) without a DSN', async () => {
    const sent: unknown[] = [];
    const transport: SentryTransport = {
      send: async () => {
        sent.push(1);
      },
    };
    const id = await captureServerException(new Error('x'), envNoDsn, undefined, transport);
    expect(id).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('never throws when the transport fails — capture must not crash the request path', async () => {
    const failing: SentryTransport = {
      send: async () => {
        throw new Error('network down');
      },
    };
    const id = await captureServerException(new Error('x'), envWithDsn, undefined, failing);
    expect(id).toBeTruthy();
  });
});
