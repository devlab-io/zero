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
interface Env {
  // Self-contained binding type (no @cloudflare/workers-types dependency for this single-file
  // asset-fronting worker). Matches the runtime Assets binding surface we use.
  ASSETS: { fetch: (request: Request | URL | string) => Promise<Response> };
}

function isHtmlNavigation(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (request.headers.get('Sec-Fetch-Mode') === 'navigate') return true;
  return (request.headers.get('Accept') ?? '').includes('text/html');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    // Only substitute the neutral shell for genuine HTML navigations. Everything else (missing
    // chunk/asset, API, non-GET) keeps its original 404 so errors are never masked as HTML 200.
    if (!isHtmlNavigation(request)) return response;

    const url = new URL(request.url);
    const shell = await env.ASSETS.fetch(new URL('/__spa-fallback.html', url.origin));
    // If the neutral shell asset is itself missing or errored, propagate ITS real error
    // response (surface the true failure — never mask it as a 404 or as a broken 200).
    if (!shell.ok) return shell;

    // Preserve the shell response's headers, forcing the HTML content type for the navigation.
    const headers = new Headers(shell.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    // A HEAD navigation must carry no body — return status + headers only.
    const body = request.method === 'HEAD' ? null : shell.body;
    return new Response(body, { status: 200, headers });
  },
};
