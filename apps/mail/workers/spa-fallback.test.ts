import { describe, expect, it } from 'vitest';

import { assertMailEnv, requiredMailEnvSchema } from './env-schema';
import worker, { shellPathForNavigation } from './spa-fallback';

// #44 (gate A8) — micro-harness for the SPA-fallback worker. A mocked ASSETS binding returns 404
// for the requested (missing) route and a configurable status for the neutral shell, so we can
// prove the worker's contract without a real deploy: a navigation gets the neutral shell only when
// it is healthy; a broken shell (500) is forwarded, not masked as 200; and non-navigation / non-GET
// requests keep their original 404.
function makeEnv(shellStatus: number, mailShellStatus: number = 404) {
  return {
    ASSETS: {
      fetch: async (input: Request | URL | string) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        // r10 : shell mail dédié (préchargé) — distinct du shell générique.
        if (url.includes('__mail-spa-fallback.html')) {
          return new Response(
            mailShellStatus === 200 ? '<!doctype html><html>mail-shell</html>' : 'boom',
            { status: mailShellStatus },
          );
        }
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

// r10 : deux shells — le Worker choisit par pathname. /mail/* reçoit le shell
// préchargé (graphe de route mail) ; /login, /settings/* et tout autre
// deep-link gardent le shell générique (contre-revue : ne pas alourdir ces
// routes de ~126 chunks mail).
describe('spa-fallback worker — sélection de shell par pathname (r10)', () => {
  const nav = (path: string) =>
    new Request(`http://app.local${path}`, {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });

  it('shellPathForNavigation : /mail et /mail/* → shell mail ; le reste → shell générique', () => {
    expect(shellPathForNavigation('/mail')).toBe('/__mail-spa-fallback.html');
    expect(shellPathForNavigation('/mail/inbox')).toBe('/__mail-spa-fallback.html');
    expect(shellPathForNavigation('/mailto-handler')).toBe('/__spa-fallback.html');
    expect(shellPathForNavigation('/login')).toBe('/__spa-fallback.html');
    expect(shellPathForNavigation('/settings/general')).toBe('/__spa-fallback.html');
    expect(shellPathForNavigation('/queue')).toBe('/__spa-fallback.html');
  });

  it('navigation /mail/inbox avec shell mail SAIN → sert le shell mail préchargé', async () => {
    const res = await worker.fetch(nav('/mail/inbox'), makeEnv(200, 200) as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('mail-shell');
  });

  it('navigation /login et /settings/* → toujours le shell GÉNÉRIQUE (jamais les preloads mail)', async () => {
    for (const path of ['/login', '/settings/general']) {
      const res = await worker.fetch(nav(path), makeEnv(200, 200) as never);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('shell');
      expect(
        await (await worker.fetch(nav(path), makeEnv(200, 200) as never)).text(),
      ).not.toContain('mail-shell');
    }
  });

  it('shell mail MANQUANT (déploiement intermédiaire) → repli sûr sur le shell générique', async () => {
    const res = await worker.fetch(nav('/mail/inbox'), makeEnv(200, 404) as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('shell');
  });
});
