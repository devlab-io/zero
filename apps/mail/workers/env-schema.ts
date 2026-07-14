// env-schema.ts — boot-time validation of the SPA-fallback worker's environment (A6).
//
// Mirror of apps/server/src/env-schema.ts: a standalone, dependency-free module (no
// `cloudflare:workers` import) so the env contract is unit-testable in Node, re-used by
// spa-fallback.ts for its boot guard (see `bootEnv` there).
//
// Why an ASSETS-shaped schema and not a copy of the server's string-var schema:
// the server reads nine required string secrets from `.dev.vars` and leaves platform bindings
// (Durable Objects, KV, Queues, R2) to the wrangler config. This asset-fronting worker is the
// inverse — it reads NO string env var. Its sole runtime dependency is the ASSETS binding,
// dereferenced on every request as `env.ASSETS.fetch(...)` (spa-fallback.ts). A missing or
// misconfigured binding (binding renamed, the `assets` block removed, wrong asset config) would
// otherwise surface as an opaque `Cannot read properties of undefined (reading 'fetch')`
// TypeError deep inside the handler. Validating the binding's fetcher shape at boot converts that
// into a legible, named failure. A `z.object({})` here — the literal transposition of the
// server's "bindings are out of the schema" rule — would validate nothing, i.e. cosmetic. The
// honest boot guard for THIS worker is the one asserting the one thing it actually consumes.

import { z } from 'zod';

/**
 * A Workers fetch-capable binding: the single surface this worker uses from `env.ASSETS`.
 * `z.custom` checks the runtime shape (a callable `.fetch`) rather than a nominal class, which is
 * all the boot guard can and should assert about a platform binding.
 */
const fetcherBinding = z.custom<{ fetch: (request: Request | URL | string) => Promise<Response> }>(
  (value) => typeof (value as { fetch?: unknown } | null | undefined)?.fetch === 'function',
  { message: 'must be a Workers fetcher binding exposing a .fetch() method' },
);

export const requiredMailEnvSchema = z.object({
  ASSETS: fetcherBinding,
});

export type RequiredMailEnv = z.infer<typeof requiredMailEnvSchema>;

/**
 * Validates the SPA-fallback worker's environment. Throws immediately with a message NAMING the
 * offending binding when ASSETS is missing or is not a fetcher. Pure and idempotent — safe to
 * unit-test in Node without the Workers runtime.
 */
export function assertMailEnv(raw: Record<string, unknown>): void {
  const result = requiredMailEnvSchema.safeParse(raw);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => String(i.path[0])))].join(', ');
    throw new Error(
      `[env] Missing or invalid required worker binding(s): ${keys}. ` +
        `The SPA-fallback worker requires an ASSETS fetcher binding — ` +
        `check apps/mail/wrangler.jsonc (assets.binding = "ASSETS").`,
    );
  }
}
