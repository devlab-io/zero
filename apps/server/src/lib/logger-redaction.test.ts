import { describeRequest, logger, REDACTED } from './logger';
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit proof of the log redaction net (pitbull A1, axe 10). Workers logs are shipped to
 * `wrangler tail` and logpush, so the bearer token, the session cookie and the Better
 * Auth account object that used to be serialised in clear text on the authentication
 * paths were leaked credentials at rest.
 */
const captured = (level: 'log' | 'error' = 'log') => {
  const spy = vi.spyOn(console, level).mockImplementation(() => {});
  return {
    spy,
    last: () => JSON.parse(spy.mock.calls.at(-1)?.[0] as string) as Record<string, unknown>,
  };
};

afterEach(() => vi.restoreAllMocks());

describe('logger redaction', () => {
  it('masks credential-named keys at any depth', () => {
    const c = captured();
    logger.info('boom', {
      outer: { authorization: 'Bearer abc', cookie: 'session=xyz', accessToken: 'ya29.secret' },
    });
    expect(JSON.stringify(c.last())).not.toContain('ya29.secret');
    const data = (c.last().data as Record<string, unknown>[])[0] as {
      outer: Record<string, string>;
    };
    expect(data.outer.authorization).toBe(REDACTED);
    expect(data.outer.cookie).toBe(REDACTED);
    expect(data.outer.accessToken).toBe(REDACTED);
  });

  it('masks the value of a [header, value] pair', () => {
    const c = captured();
    logger.info('headers', [
      ['authorization', 'Bearer abc'],
      ['user-agent', 'vitest'],
    ]);
    const pairs = (c.last().data as string[][][])[0];
    expect(pairs[0]).toEqual(['authorization', REDACTED]);
    expect(pairs[1]).toEqual(['user-agent', 'vitest']);
  });

  it('leaves innocuous keys and Dates intact', () => {
    const c = captured();
    logger.info('ok', {
      accessCount: 3,
      tokenizer: 'v2',
      at: new Date('2026-07-25T00:00:00.000Z'),
    });
    const data = (c.last().data as Record<string, unknown>[])[0];
    expect(data.accessCount).toBe(3);
    expect(data.tokenizer).toBe('v2');
    expect(data.at).toBe('2026-07-25T00:00:00.000Z');
  });

  it('keeps serialising Errors', () => {
    const c = captured('error');
    logger.error('failed', new Error('nope'));
    const data = (c.last().data as Record<string, unknown>[])[0];
    expect(data.message).toBe('nope');
  });
});

describe('describeRequest', () => {
  it('reports the shape of the credentials without their value', () => {
    const summary = describeRequest(
      new Request('https://server.test/mcp?x=1', {
        headers: {
          Authorization: 'Bearer super-secret',
          Cookie: 'session=xyz',
          'User-Agent': 'vitest',
        },
      }),
    );
    expect(JSON.stringify(summary)).not.toContain('super-secret');
    expect(JSON.stringify(summary)).not.toContain('session=xyz');
    expect(summary).toMatchObject({
      method: 'GET',
      path: '/mcp',
      userAgent: 'vitest',
      hasAuthorization: true,
      authorizationLength: 'Bearer super-secret'.length,
      hasCookie: true,
    });
  });
});
