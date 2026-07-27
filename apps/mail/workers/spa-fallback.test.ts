import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { assertMailEnv, requiredMailEnvSchema } from './env-schema';
import cspScriptHashes from './csp-script-hashes.generated.json';
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

  it("le CSP porte form-action 'self' — default-src ne couvre pas cette directive", async () => {
    const res = await worker.fetch(navRequest(), makeEnv(200) as never);
    expect(res.headers.get('Content-Security-Policy')).toContain("form-action 'self'");
  });

  // --- script-src sans 'unsafe-inline' ---------------------------------------------------
  //
  // Le corps des e-mails est rendu par innerHTML dans un shadow root de la page principale —
  // pas une frontière de sécurité. Tant que script-src portait 'unsafe-inline', un `onerror=`
  // survivant à l'assainisseur s'exécutait comme du script de première partie ; trois XSS
  // stockés l'ont démontré dans ce dépôt. Ces assertions verrouillent la directive.
  async function servedCsp() {
    const res = await worker.fetch(navRequest(), makeEnv(200) as never);
    return res.headers.get('Content-Security-Policy') ?? '';
  }

  function scriptSrcOf(csp: string) {
    return (
      csp
        .split(';')
        .map((directive) => directive.trim())
        .find((directive) => directive.startsWith('script-src')) ?? ''
    );
  }

  it("script-src ne porte plus 'unsafe-inline' — ni aucun autre laissez-passer inline", async () => {
    const scriptSrc = scriptSrcOf(await servedCsp());

    expect(scriptSrc).not.toBe('');
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // 'unsafe-hashes' ré-autoriserait les gestionnaires en attribut (`onerror=…`), c'est-à-dire
    // exactement le vecteur que cette directive doit fermer.
    expect(scriptSrc).not.toContain("'unsafe-hashes'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // Une CSP entière ne doit pas non plus rouvrir la porte par une autre directive de script.
    expect(await servedCsp()).not.toContain("script-src-elem 'unsafe-inline'");
  });

  it("script-src garde 'self' et autorise les scripts inline du shell par EMPREINTE", async () => {
    const scriptSrc = scriptSrcOf(await servedCsp());

    expect(scriptSrc).toContain("'self'");
    expect(cspScriptHashes.hashes.length).toBeGreaterThan(0);
    for (const hash of cspScriptHashes.hashes) {
      expect(scriptSrc).toContain(`'${hash}'`);
    }
    // Une empreinte est bien de la forme attendue par les navigateurs.
    for (const hash of cspScriptHashes.hashes) {
      expect(hash).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
    }
  });

  it("style-src garde 'unsafe-inline' : les e-mails portent des styles inline légitimes", async () => {
    // Décision explicite, pas un oubli — voir le commentaire de CONTENT_SECURITY_POLICY.
    // L'injection CSS reste une nuisance de mise en page, d'un ordre en dessous de
    // l'exécution de code que script-src ferme désormais.
    const csp = await servedCsp();
    const styleSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('style-src'));

    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it('HSTS est posé sur le document ET sur les assets', async () => {
    const expected = 'max-age=31536000; includeSubDomains';

    const document = await worker.fetch(navRequest(), makeEnv(200) as never);
    expect(document.headers.get('Strict-Transport-Security')).toBe(expected);

    const asset = await worker.fetch(
      new Request('http://app.local/assets/entry.client-Hao9yJWR.js', {
        headers: { accept: '*/*' },
      }),
      makeEnvWithDirectHit(200, 'application/javascript; charset=utf-8') as never,
    );
    expect(asset.headers.get('Strict-Transport-Security')).toBe(expected);
  });
});

// --- Le Worker doit RÉELLEMENT s'interposer -------------------------------------------------
//
// Tout ce qui précède s'appuie sur un binding ASSETS simulé, qui appelle toujours le Worker.
// La plateforme, elle, ne l'appelle pas : quand un asset existe, la couche Assets répond
// directement et le Worker n'est jamais exécuté. Mesuré en local avec `wrangler dev` :
// `curl -D - http://localhost:3000/` ne portait NI CSP, NI X-Frame-Options, NI HSTS — la page
// d'accueil, seule page publique, n'était couverte par aucun en-tête, tandis que `/mail/inbox`
// (sans asset correspondant) les portait tous. Le test « a direct HTML asset hit also gets CSP »
// ci-dessus était donc un vert qui ne décrivait pas la production.
//
// `assets.run_worker_first: true` referme cet écart. Comme aucun test unitaire ne peut observer
// le routage de la plateforme, on verrouille ici la CONFIGURATION qui le gouverne.
describe('wrangler.jsonc — le Worker est bien devant les assets', () => {
  // Chemin relatif au cwd de vitest (apps/mail), comme thread-display.transition.test.ts :
  // sous happy-dom, `new URL()` construit une URL DOM que readFileSync refuse.
  // JSONC : on retire les commentaires de ligne et les virgules traînantes, comme build-env.mjs.
  const config = JSON.parse(
    readFileSync('wrangler.jsonc', 'utf8')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1'),
  );

  it('run_worker_first est actif : sans lui, `/` est servi SANS aucun en-tête de sécurité', () => {
    expect(config.assets.run_worker_first).toBe(true);
  });

  it('not_found_handling reste "none" : le 404 doit remonter au Worker, pas être masqué', () => {
    expect(config.assets.not_found_handling).toBe('none');
  });

  it('les environnements déployés héritent de la config assets (aucun ne la redéfinit)', () => {
    for (const [name, env] of Object.entries(config.env ?? {})) {
      expect(
        (env as { assets?: unknown }).assets,
        `env.${name} redéfinit "assets" et perdrait run_worker_first`,
      ).toBeUndefined();
    }
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
