/**
 * #44 (gate A8, landing prerender) — dedicated neutral SPA fallback.
 *
 * The landing is prerendered into build/client/index.html (real HomeContent). Cloudflare's
 * `single-page-application` not-found handler would otherwise serve that landing HTML for every
 * unmatched deep-link (e.g. /mail/inbox), re-breaking the frozen finding that a deep-link must
 * not be served landing content.
 *
 * This Worker keeps both properties:
 *   • an existing asset (index.html at `/`, hashed JS/CSS, prerendered files) is served as-is;
 *   • a NAVIGATION request (GET/HEAD asking for HTML) with no matching asset is served the
 *     dedicated neutral shell __spa-fallback.html at the requested URL (200), so the client
 *     router hydrates the requested route rather than being shown marketing content.
 *
 * Non-navigation 404s — a missing JS/CSS chunk, a source map, an API call, any non-GET/HEAD
 * method — are passed through UNCHANGED. This avoids masking a real error as HTML-in-200 (a
 * broken chunk request must surface as a 404, not as an HTML body that fails to parse).
 *
 * Requires `assets.not_found_handling: "none"` so ASSETS.fetch surfaces the 404 to this Worker
 * instead of substituting index.html at the asset layer.
 */
import cspScriptHashes from './csp-script-hashes.generated.json';
import { assertMailEnv } from './env-schema';

interface Env {
  // Self-contained binding type (no @cloudflare/workers-types dependency for this single-file
  // asset-fronting worker). Matches the runtime Assets binding surface we use.
  ASSETS: { fetch: (request: Request | URL | string) => Promise<Response> };
}

// --- Boot-time validation (A6) --------------------------------------------------------
// Mirror of the server's boot guard (apps/server/src/env.ts `bootEnv`): validate the required
// env exactly once per isolate, at the first request. The zod schema + `assertMailEnv` live in
// the dependency-free ./env-schema module so the env contract is unit-testable in Node.
let booted = false;

/** Boot guard: validates the worker env exactly once per isolate. Called at first request. */
function bootEnv(env: Env): void {
  if (booted) return;
  assertMailEnv(env as unknown as Record<string, unknown>);
  booted = true;
}

function isHtmlNavigation(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (request.headers.get('Sec-Fetch-Mode') === 'navigate') return true;
  return (request.headers.get('Accept') ?? '').includes('text/html');
}

// --- Security headers (audit: CSP/frame-ancestors gap on the SPA shell) --------------------
//
// script-src NE PORTE PLUS 'unsafe-inline'. C'était le trou : le corps des e-mails est rendu par
// `innerHTML` dans un shadow root de la page principale (mail-content.tsx) — un shadow root n'est
// PAS une frontière de sécurité, tout ce qui s'y exécute est du script de première partie. Tant
// que la CSP autorisait l'inline, un `onerror=` survivant à l'assainisseur s'exécutait ; mesuré en
// navigateur : avec `script-src 'self' <empreintes>`, le même balisage est injecté mais reste
// inerte. Les trois XSS stockés corrigés dans ce dépôt auraient tous été neutralisés par cette
// seule directive.
//
// Les `<script>` inline du shell prérendu (anti-flash de thème next-themes, restauration de
// défilement et bootstrap d'hydratation React Router, révélateur de Suspense de React DOM,
// rééquilibrage react-wrap-balancer) sont autorisés NOMMÉMENT par leur empreinte sha256, calculée
// À CHAQUE BUILD sur les octets réellement émis (apps/mail/scripts/csp-hashes.mjs, appelé en fin
// de build) et vérifiée par scripts/checks/csp-inline-scripts.mjs. Un nonce par réponse aurait
// exigé de réécrire chaque document au vol dans ce Worker (HTMLRewriter sur ~100 kB d'HTML à
// chaque navigation) sans rien apporter de plus ici, le HTML étant un asset statique de confiance.
//
// Une empreinte ne peut PAS autoriser un gestionnaire d'événement en attribut (`onerror=…`) —
// il faudrait 'unsafe-hashes', qu'on n'ajoute pas. C'est précisément l'effet recherché.
//
// style-src GARDE 'unsafe-inline', et c'est délibéré : le corps des e-mails porte légitimement des
// `style="…"` et des `<style>` (assainis par sanitize-html), et les bibliothèques d'UI (radix,
// vaul, sonner) injectent leurs feuilles au montage. Le retirer casserait le rendu du courrier
// sans neutraliser d'exécution de script : l'injection CSS reste une nuisance de mise en page et
// d'exfiltration par sélecteur, d'un ordre de gravité en dessous de l'exécution de code.
//
// connect-src/img-src stay origin-broad (https:) because the backend origin differs per environment
// (staging/prod are different Worker hostnames than the mail app) and optional third parties
// (Sentry, PostHog, the image proxy) are configured via env vars not visible to this worker at
// header-authoring time — hardcoding the wrong origin would silently break API calls or error
// reporting.
//
// frame-ancestors 'none' (+ the legacy X-Frame-Options: DENY) is the actual audit ask: the app must
// never be embeddable in a third-party frame (clickjacking).
const INLINE_SCRIPT_SOURCES = cspScriptHashes.hashes.map((hash) => `'${hash}'`).join(' ');

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Un formulaire injecté ne peut plus poster ailleurs que sur cette origine : la
  // directive manquait, et `default-src` ne couvre PAS `form-action`.
  "form-action 'self'",
  `script-src 'self' ${INLINE_SCRIPT_SOURCES}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html');
}

/**
 * Applies the security header set to every response this worker returns. nosniff/Referrer-Policy/
 * Permissions-Policy are cheap and safe on any response (assets included). CSP/X-Frame-Options are
 * only meaningful — and only added — on HTML documents; stamping a CSP on a hashed JS/CSS/image
 * asset response is a no-op at best (browsers scope CSP enforcement to the document that serves it).
 */
function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // HSTS sur TOUTES les réponses, documents comme assets : le navigateur mémorise la
  // contrainte au niveau de l'hôte, et une première requête en clair sur un asset suffirait
  // à ouvrir la fenêtre que cet en-tête ferme. `includeSubDomains` couvre les sous-domaines
  // du même hôte ; pas de `preload`, qui engage la liste HSTS des navigateurs et ne se
  // retire pas en une révocation.
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (isHtmlResponse(response)) {
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    headers.set('X-Frame-Options', 'DENY');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Fail loud and legibly at the first request if the ASSETS binding is missing/misconfigured,
    // rather than crashing opaquely on `env.ASSETS.fetch` below.
    bootEnv(env);
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return withSecurityHeaders(response);

    // Only substitute the neutral shell for genuine HTML navigations. Everything else (missing
    // chunk/asset, API, non-GET) keeps its original 404 so errors are never masked as HTML 200.
    if (!isHtmlNavigation(request)) return withSecurityHeaders(response);

    const url = new URL(request.url);
    const shell = await env.ASSETS.fetch(new URL('/__spa-fallback.html', url.origin));
    // If the neutral shell asset is itself missing or errored, propagate ITS real error
    // response (surface the true failure — never mask it as a 404 or as a broken 200).
    if (!shell.ok) return withSecurityHeaders(shell);

    // Preserve the shell response's headers, forcing the HTML content type for the navigation.
    const headers = new Headers(shell.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    // A HEAD navigation must carry no body — return status + headers only.
    const body = request.method === 'HEAD' ? null : shell.body;
    return withSecurityHeaders(new Response(body, { status: 200, headers }));
  },
};
