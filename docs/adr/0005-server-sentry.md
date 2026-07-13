# ADR 0005 — Server Sentry without the @sentry/cloudflare SDK import

- Status: Accepted
- Date: 2026-07-13
- Issue: devlab-io/zero#29 — [niveau9] V3.4 server-runtime-guardrails
- Scope: `apps/server` server-side error capture. No new dependency, no committed DSN.

## Context

Check `observability.md` §4 requires server-side Sentry init with a release, and a
proof that a test error is captured to the transport in dev (no deploy). The issue
names `@sentry/cloudflare@9.43.0` (already a dependency).

**Hard conflict found in PHASE 2 (reproducible):** importing `@sentry/cloudflare`
anywhere in the server program pulls its shipped
`/// <reference types="@cloudflare/workers-types" />`. That package's ambient
`declare module 'cloudflare:workers'` redeclares `env`, shadowing the
wrangler-generated typing (`worker-configuration.d.ts` → `Cloudflare.Env`). The
result strips the project bindings/vars from `env.*` and produces 15 `tsc` errors
in unrelated files (`bulk-delete.ts`, `workflow-functions.ts`, `routes/agent/mcp.ts`).
The frozen A2/A4 gate is `server = 0` errors (blocking), so this is a fail.

Attempts that did **not** resolve it:

- Ambient re-assertion of the global `Env` and of the `cloudflare:workers` module
  (`interface Env extends Cloudflare.Env` / `export const env: Cloudflare.Env`) —
  the `env` const resolves via `@cloudflare/workers-types`' own module-scoped
  `Env`, unreachable from a global augmentation.
- `tsconfig` `paths` mapping `@cloudflare/workers-types` to an empty stub — a
  type-reference directive bypasses `paths`.
- Isolating the import to a single file — the pollution is program-global.

The remaining SDK-based options (editing `node_modules`, changing the lockfile,
or regenerating `worker-configuration.d.ts`) are all out of scope.

## Decision

**Capture to Sentry directly with a minimal, dependency-free client
(`lib/sentry.ts`) that speaks the Sentry envelope protocol — no
`@sentry/cloudflare` import.**

- `buildSentryOptions(env)` returns `{ dsn, release, environment }` or `undefined`
  (clean no-op) when `SENTRY_DSN` is unset. `release` defaults to
  `zero-server@<NODE_ENV>` and is overridable via `SENTRY_RELEASE`.
- `captureServerException(error, env, ctx?, transport?)` builds a Sentry event
  (exception + release + environment + transaction), serialises a Sentry envelope,
  and POSTs it to `https://<host>/api/<projectId>/envelope/`. It never throws (a
  failed send is swallowed by design) and is a no-op without a DSN.
- `main.ts` wraps the request path in `try/catch` and, on an unhandled error,
  `ctx.waitUntil(captureServerException(err, this.env, { transaction }))` then
  rethrows.
- The transport is injectable; `lib/sentry.test.ts` proves an error is captured to
  a recording transport with the release tag, and that a missing DSN is a no-op.

## Consequences

- Same observable outcome as the SDK (errors → Sentry ingest, tagged with a
  release), with `tsc` staying at 0 and no lockfile/dependency change.
- No committed DSN; it is provided at runtime via `SENTRY_DSN` (binding/secret),
  optional.
- Because the SDK is not initialised, it does **not** register an OTel-compatible
  trace provider; that has no bearing on ADR 0003 (async-path spans stay inert
  until an OTLP exporter is wired; the tRPC path uses `trace-context.ts`).
- Trade-off: we forgo the SDK's automatic breadcrumbs/integrations. If those are
  wanted later, the clean fix is upstream — align `@cloudflare/workers-types` with
  the wrangler-generated types so the SDK import no longer breaks `tsc`.
