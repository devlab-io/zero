import { describe, expect, it } from 'vitest';

import { assertMailEnv, requiredMailEnvSchema } from './env-schema';
import worker from './spa-fallback';

// #44 (gate A8) — micro-harness for the SPA-fallback worker. A mocked ASSETS binding returns 404
// for the requested (missing) route and a configurable status for the neutral shell, so we can
// prove the worker's contract without a real deploy: a navigation gets the neutral shell only when
// it is healthy; a broken shell (500) is forwarded, not masked as 200; and non-navigation / non-GET
// requests keep their original 404.
function makeEnv(shellStatus: number) {
  return {
    ASSETS: {
      fetch: async (input: Request | URL | string) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('__spa-fallback.html')) {
          return new Response(shellStatus === 200 ? '<!doctype html><html>shell</html>' : 'boom', {
            status: shellStatus,
          });
        }
        // The requested route/asset itself is missing (not_found_handling: "none" surfaces a 404).
        return new Response('not found', { status: 404 });
      },
    },
  };
}

// A browser navigation. NB: `Sec-Fetch-Mode` is a forbidden header the Request constructor strips,
// so we assert navigation via the other branch of the worker's guard: an `Accept: text/html` GET/HEAD.
function navRequest(method = 'GET') {
  return new Request('http://app.local/mail/inbox', {
    method,
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
}

describe('spa-fallback worker', () => {
  it('navigation to a missing route with a HEALTHY shell → serves neutral shell 200 (html)', async () => {
    const res = await worker.fetch(navRequest(), makeEnv(200) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('shell');
  });

  it('navigation with a BROKEN shell (500) → forwards 500, never a masked 200', async () => {
    const res = await worker.fetch(navRequest(), makeEnv(500) as never);
    expect(res.status).toBe(500);
  });

  it('navigation with a MISSING shell (404) → returns the real 404, not landing', async () => {
    const res = await worker.fetch(navRequest(), makeEnv(404) as never);
    expect(res.status).toBe(404);
  });

  it('non-navigation missing asset (Accept: */*) → passes through original 404', async () => {
    const req = new Request('http://app.local/assets/missing.js', {
      method: 'GET',
      headers: { accept: '*/*' },
    });
    const res = await worker.fetch(req, makeEnv(200) as never);
    expect(res.status).toBe(404);
  });

  it('non-GET navigation (POST) → passes through original 404', async () => {
    const res = await worker.fetch(navRequest('POST'), makeEnv(200) as never);
    expect(res.status).toBe(404);
  });

  it('HEAD navigation → 200 with no body', async () => {
    const res = await worker.fetch(navRequest('HEAD'), makeEnv(200) as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

// Security headers (audit: CSP/frame-ancestors gap on the SPA shell) — every response gets the
// baseline hardening headers; CSP/X-Frame-Options are added only to HTML documents (see
// `isHtmlResponse` in spa-fallback.ts), not to hashed JS/CSS/image asset responses.
function makeEnvWithDirectHit(status: number, contentType: string) {
  return {
    ASSETS: {
      fetch: async () => new Response('body', { status, headers: { 'content-type': contentType } }),
    },
  };
}

describe('spa-fallback worker — security headers', () => {
  it('navigation served the neutral shell → carries CSP, frame-ancestors none, nosniff, referrer-policy', async () => {
    const res = await worker.fetch(navRequest(), makeEnv(200) as never);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toContain('geolocation=()');
  });

  it('a direct HTML asset hit (e.g. GET / with an existing index.html) also gets CSP', async () => {
    const req = new Request('http://app.local/', {
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    const res = await worker.fetch(
      req,
      makeEnvWithDirectHit(200, 'text/html; charset=utf-8') as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('a non-HTML asset (hashed JS chunk) gets nosniff but NOT a Content-Security-Policy header', async () => {
    const req = new Request('http://app.local/assets/entry.client-Hao9yJWR.js', {
      headers: { accept: '*/*' },
    });
    const res = await worker.fetch(
      req,
      makeEnvWithDirectHit(200, 'application/javascript; charset=utf-8') as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
    expect(res.headers.get('X-Frame-Options')).toBeNull();
  });

  it('a broken shell (500) still gets the baseline headers, not the full CSP set', async () => {
    const res = await worker.fetch(navRequest(), makeEnv(500) as never);
    expect(res.status).toBe(500);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

// A6 — boot-time env validation. The worker's fetch handler calls `bootEnv(env)` → `assertMailEnv`
// at the first request; the pure assert is tested here directly (deterministic, independent of the
// once-per-isolate `booted` flag), mirroring apps/server/src/env-schema.test.ts.
describe('assertMailEnv — boot guard for the ASSETS binding', () => {
  const validEnv = { ASSETS: { fetch: async () => new Response('ok') } };

  it('declares exactly the ASSETS binding in its schema', () => {
    expect(Object.keys(requiredMailEnvSchema.shape)).toEqual(['ASSETS']);
  });

  it('passes when ASSETS is a fetcher binding (extra bindings/vars ignored)', () => {
    expect(() =>
      assertMailEnv({ ...validEnv, VITE_PUBLIC_APP_URL: 'https://0.email', SOME_KV: {} }),
    ).not.toThrow();
    expect(requiredMailEnvSchema.safeParse(validEnv).success).toBe(true);
  });

  it('throws a legible error NAMING ASSETS when the binding is absent', () => {
    expect(() => assertMailEnv({})).toThrow(/ASSETS/);
  });

  it('throws when ASSETS is present but not a fetcher (no .fetch method)', () => {
    expect(() => assertMailEnv({ ASSETS: {} })).toThrow(/ASSETS/);
    expect(() => assertMailEnv({ ASSETS: { fetch: 'nope' } })).toThrow(/ASSETS/);
  });

  it('the error message points to the wrangler assets binding config', () => {
    expect(() => assertMailEnv({})).toThrow(/wrangler\.jsonc/);
  });
});
