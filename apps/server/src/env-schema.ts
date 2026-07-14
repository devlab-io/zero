// env-schema.ts — boot-time validation of the required server environment (A5).
//
// Kept in a standalone, dependency-free module (no `cloudflare:workers` import) so it can be
// unit-tested in Node. env.ts re-uses `assertServerEnv` from here for its boot guard. Zod
// schema of the variables the server REQUIRES to function; bindings (Durable Objects, KV,
// Queues, R2, AI, Vectorize, Hyperdrive) are guaranteed by the wrangler config, not by
// `.dev.vars`, so they are out of this schema. Everything not listed here is optional and
// feature-gated: its absence disables a feature, it does not stop the boot. See
// docs/checks/niveau9/observability.md §6 and apps/server/.dev.vars.example.

import { z } from 'zod';

// M2 (incident deploy prod 2026-07-13): DATABASE_URL et BETTER_AUTH_URL, exigées ici, ne
// sont JAMAIS lues au runtime — la DB passe par env.HYPERDRIVE.connectionString et le
// baseURL d'auth par VITE_PUBLIC_BACKEND_URL. Les exiger a rendu un 500 global au premier
// boot d'un worker neuf. Retirées du requis; drizzle-kit (outillage local) lit DATABASE_URL
// depuis process.env, hors de ce garde.
export const requiredServerEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  COOKIE_DOMAIN: z.string().min(1),
  VITE_PUBLIC_APP_URL: z.string().min(1),
  VITE_PUBLIC_BACKEND_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

export type RequiredServerEnv = z.infer<typeof requiredServerEnvSchema>;

/**
 * Validates the required server environment. Throws immediately with a message NAMING the
 * offending key(s) when one is missing or empty. Pure and idempotent — safe to unit-test.
 */
export function assertServerEnv(raw: Record<string, unknown>): void {
  const result = requiredServerEnvSchema.safeParse(raw);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => String(i.path[0])))].join(', ');
    throw new Error(
      `[env] Missing or invalid required server environment variable(s): ${keys}. ` +
        `Set them in apps/server/.dev.vars (see apps/server/.dev.vars.example).`,
    );
  }
}
