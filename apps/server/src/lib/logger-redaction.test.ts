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

describe('logger redaction — masquage par MOTIF DE VALEUR', () => {
  // Le filet par NOM DE CLÉ ne voyait rien d'une chaîne nue. Constat mesuré :
  // lib/factories/google-subscription.factory.ts journalisait `GOOGLE_S_ACCOUNT` entier
  // — `private_key` RSA comprise — en argument positionnel, vers wrangler tail et logpush.
  const cases: [string, string, string][] = [
    [
      'clé privée PEM',
      '{"private_key":"-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBg\\n-----END PRIVATE KEY-----"}',
      'MIIEvQIBADANBg',
    ],
    [
      'en-tête Bearer dans une phrase',
      'called with Bearer abcdef0123456789 header',
      'abcdef0123456789',
    ],
    ['jeton d’accès Google', 'token=ya29.a0AfH6SMB-secret-value', 'ya29.a0AfH6SMB-secret-value'],
    [
      'jeton de rafraîchissement Google',
      'refresh 1//0gLongRefreshTokenValue00',
      '1//0gLongRefreshTokenValue00',
    ],
    ['JWT', 'jwt eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.sig', 'eyJhbGciOiJSUzI1NiJ9'],
    [
      'URL de connexion avec identifiants',
      'postgres://admin:hunter2@db.internal:5432/app',
      'hunter2',
    ],
  ];

  it.each(cases)('masque %s dans une chaîne imbriquée', (_label, payload, secret) => {
    const c = captured();
    logger.info('boot', { detail: payload });
    expect(JSON.stringify(c.last())).not.toContain(secret);
  });

  it.each(cases)('masque %s passé comme MESSAGE', (_label, payload, secret) => {
    const c = captured();
    logger.info(payload);
    expect(JSON.stringify(c.last())).not.toContain(secret);
  });

  it('masque le secret sans jeter le reste de la ligne', () => {
    const c = captured();
    logger.info('appel', { detail: 'GET /x with Bearer abcdef0123456789 done' });
    const line = JSON.stringify(c.last());
    expect(line).toContain('GET /x with');
    expect(line).toContain('done');
    expect(line).toContain(REDACTED);
  });

  it('laisse intacte une chaîne ordinaire', () => {
    const c = captured();
    logger.info('sync', { detail: 'thread th-42 synchronised in 120ms' });
    expect(JSON.stringify(c.last())).toContain('thread th-42 synchronised in 120ms');
  });
});
