import {
  computeBackoffDelayMs,
  DEFAULT_BACKOFF,
  extractStatus,
  isNetworkError,
  isRetryableGmailError,
  mapWithConcurrency,
  parseRetryAfterMs,
  withGmailBackoff,
  type BackoffDeps,
} from './gmail-backoff';
import { describe, expect, it } from 'vitest';

// Deps déterministes : aucun timer réel, random figé → schedule testable.
const fixedDeps = (random = 0.5): { deps: BackoffDeps; delays: number[] } => {
  const delays: number[] = [];
  return {
    delays,
    deps: { sleep: async (ms) => void delays.push(ms), random: () => random },
  };
};

describe('isRetryableGmailError', () => {
  it('retries on 429', () => {
    expect(isRetryableGmailError({ code: 429 })).toBe(true);
    expect(isRetryableGmailError({ response: { status: 429 } })).toBe(true);
  });

  it('retries on transient 5xx', () => {
    for (const s of [500, 502, 503, 504]) expect(isRetryableGmailError({ code: s })).toBe(true);
  });

  it('retries on 403 only with a rate-limit reason', () => {
    expect(
      isRetryableGmailError({ code: 403, errors: [{ reason: 'userRateLimitExceeded' }] }),
    ).toBe(true);
    expect(isRetryableGmailError({ code: 403, errors: [{ reason: 'forbidden' }] })).toBe(false);
    expect(isRetryableGmailError({ code: 403 })).toBe(false);
  });

  it('does NOT retry on 400/401/404/501', () => {
    for (const s of [400, 401, 404, 501]) expect(isRetryableGmailError({ code: s })).toBe(false);
  });

  it('extractStatus parses string and object shapes', () => {
    expect(extractStatus({ code: '429' })).toBe(429);
    expect(extractStatus({ status: 503 })).toBe(503);
    expect(extractStatus({ response: { status: 500 } })).toBe(500);
    expect(extractStatus({})).toBeUndefined();
  });
});

describe('computeBackoffDelayMs', () => {
  it('is exponential, bounded [cap/2, cap], and never the flat 60s', () => {
    const opts = DEFAULT_BACKOFF; // base 500, factor 2, max 8000
    const d0 = computeBackoffDelayMs(0, opts, () => 0.5); // cap 500 -> 375
    const d1 = computeBackoffDelayMs(1, opts, () => 0.5); // cap 1000 -> 750
    const d2 = computeBackoffDelayMs(2, opts, () => 0.5); // cap 2000 -> 1500
    expect(d0).toBe(375);
    expect(d1).toBe(750);
    expect(d2).toBe(1500);
    expect(d1).toBeGreaterThan(d0);
    for (let a = 0; a < 12; a++) {
      const d = computeBackoffDelayMs(a, opts, () => 1);
      expect(d).toBeLessThanOrEqual(opts.maxMs); // capped, jamais 60000
      expect(d).toBeGreaterThan(0);
    }
  });

  it('jitter keeps the delay within [cap/2, cap]', () => {
    const opts = DEFAULT_BACKOFF;
    for (const r of [0, 0.25, 0.99]) {
      const d = computeBackoffDelayMs(3, opts, () => r); // cap = 4000
      expect(d).toBeGreaterThanOrEqual(2000);
      expect(d).toBeLessThanOrEqual(4000);
    }
  });
});

describe('parseRetryAfterMs', () => {
  it('parses seconds', () => {
    expect(parseRetryAfterMs({ response: { headers: { 'retry-after': '2' } } })).toBe(2000);
  });
  it('parses an HTTP date against an injected clock', () => {
    const now = () => 1000;
    const future = new Date(1000 + 5000).toUTCString();
    const ms = parseRetryAfterMs({ response: { headers: { 'retry-after': future } } }, now);
    expect(ms).toBeGreaterThanOrEqual(4000);
    expect(ms).toBeLessThanOrEqual(5000);
  });
  it('returns undefined when absent', () => {
    expect(parseRetryAfterMs({ code: 429 })).toBeUndefined();
  });
});

describe('withGmailBackoff', () => {
  it('retries a rate-limited op then succeeds; delays grow exponentially', async () => {
    const { deps, delays } = fixedDeps();
    let calls = 0;
    const result = await withGmailBackoff(
      async () => {
        calls += 1;
        if (calls <= 2) throw { code: 429 };
        return 'ok';
      },
      DEFAULT_BACKOFF,
      deps,
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(delays).toEqual([375, 750]);
    expect(Math.max(...delays)).toBeLessThan(60000);
  });

  it('does NOT retry a non-retryable error and never sleeps', async () => {
    const { deps, delays } = fixedDeps();
    let calls = 0;
    await expect(
      withGmailBackoff(
        async () => {
          calls += 1;
          throw { code: 400 };
        },
        DEFAULT_BACKOFF,
        deps,
      ),
    ).rejects.toEqual({ code: 400 });
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it('gives up after maxRetries and rethrows', async () => {
    const { deps, delays } = fixedDeps();
    let calls = 0;
    await expect(
      withGmailBackoff(
        async () => {
          calls += 1;
          throw { code: 503 };
        },
        { ...DEFAULT_BACKOFF, maxRetries: 2 },
        deps,
      ),
    ).rejects.toEqual({ code: 503 });
    expect(calls).toBe(3); // 1 + 2 retries
    expect(delays.length).toBe(2);
  });

  it('honors a server Retry-After (capped, never 60s flat)', async () => {
    const { deps, delays } = fixedDeps();
    let calls = 0;
    await withGmailBackoff(
      async () => {
        calls += 1;
        if (calls === 1) throw { code: 429, response: { headers: { 'retry-after': '2' } } };
        return 'done';
      },
      DEFAULT_BACKOFF,
      deps,
    );
    expect(delays).toEqual([2000]);
  });

  it('caps a pathological Retry-After below the old 60s flat', async () => {
    const { deps, delays } = fixedDeps();
    let calls = 0;
    await withGmailBackoff(
      async () => {
        calls += 1;
        if (calls === 1) throw { code: 429, response: { headers: { 'retry-after': '120' } } };
        return 'done';
      },
      DEFAULT_BACKOFF,
      deps,
    );
    expect(delays).toEqual([DEFAULT_BACKOFF.retryAfterCapMs]); // 30000 < 60000
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order and bounds concurrency to the limit', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const promise = mapWithConcurrency(items, 3, async (x) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (maxActive >= 3) release();
      await gate;
      active -= 1;
      return x * 2;
    });

    const results = await promise;
    expect(maxActive).toBe(3);
    expect(results).toEqual(items.map((x) => x * 2));
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P9 — le backoff ne couvrait pas les erreurs RÉSEAU, le transitoire le plus fréquent
// sur Workers. Mesuré avant correction : `TypeError('fetch failed')`, `ECONNRESET` et
// le statut 408 renvoyaient tous `false`.
// ---------------------------------------------------------------------------

describe('isRetryableGmailError — pannes de transport (P9)', () => {
  it("classe `TypeError('fetch failed')` comme rejouable", () => {
    expect(isRetryableGmailError(new TypeError('fetch failed'))).toBe(true);
  });

  it('classe ECONNRESET comme rejouable, y compris via la chaîne `cause` d’undici', () => {
    expect(
      isRetryableGmailError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
    ).toBe(true);
    expect(
      isRetryableGmailError(
        Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('boom'), { code: 'ECONNRESET' }),
        }),
      ),
    ).toBe(true);
  });

  it('classe le 408 comme rejouable (la requête n’a jamais été traitée)', () => {
    expect(isRetryableGmailError({ code: 408 })).toBe(true);
    expect(isRetryableGmailError({ response: { status: 408 } })).toBe(true);
  });

  it('couvre les autres codes de transport courants', () => {
    for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN', 'UND_ERR_SOCKET']) {
      expect(isRetryableGmailError(Object.assign(new Error('x'), { code }))).toBe(true);
    }
    expect(isRetryableGmailError(new Error('Network connection lost.'))).toBe(true);
    expect(isRetryableGmailError(new Error('socket hang up'))).toBe(true);
  });

  it('ne requalifie PAS un 4xx déterministe en panne réseau à cause de son libellé', () => {
    expect(isRetryableGmailError({ code: 400, message: 'fetch failed' })).toBe(false);
    expect(isRetryableGmailError({ code: 404, message: 'connection reset' })).toBe(false);
    expect(isRetryableGmailError({ code: 401 })).toBe(false);
    expect(isRetryableGmailError({ code: 403 })).toBe(false);
  });

  it('laisse intacte la classification historique', () => {
    expect(isRetryableGmailError({ code: 429 })).toBe(true);
    expect(isRetryableGmailError({ code: 503 })).toBe(true);
    expect(
      isRetryableGmailError({ code: 403, errors: [{ reason: 'userRateLimitExceeded' }] }),
    ).toBe(true);
    expect(isRetryableGmailError({ code: 403, errors: [{ reason: 'forbidden' }] })).toBe(false);
    expect(isRetryableGmailError(new Error('malformed request'))).toBe(false);
    expect(isRetryableGmailError(undefined)).toBe(false);
  });

  it('isNetworkError ne remonte pas une chaîne `cause` infinie', () => {
    const loop: { cause?: unknown; message: string } = { message: 'x' };
    loop.cause = loop;
    expect(() => isNetworkError(loop)).not.toThrow();
    expect(isNetworkError(loop)).toBe(false);
  });

  it('une panne réseau est effectivement REJOUÉE par withGmailBackoff', async () => {
    const { deps, delays } = fixedDeps();
    let calls = 0;
    const value = await withGmailBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new TypeError('fetch failed');
        return 'ok';
      },
      DEFAULT_BACKOFF,
      deps,
    );
    expect(value).toBe('ok');
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
  });
});
