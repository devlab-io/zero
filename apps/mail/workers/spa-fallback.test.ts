import { describe, expect, it } from 'vitest';

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
