# ADR 0004 — Structured server logger (lib/logger.ts)

- Status: Accepted
- Date: 2026-07-13
- Issue: devlab-io/zero#29 — [niveau9] V3.4 server-runtime-guardrails
- Scope: `apps/server/src` logging. No behaviour change beyond log formatting.

## Context

Check `observability.md` §1 requires server paths to go through "the logger
(logging-service or a justified replacement)", and the A5 ratchet drives raw
`console.*` in `apps/server/src` down (baseline 465 → ≤20 for this job's
perimeter, excluding `routes/agent/**` and `lib/driver/**`).

`lib/logging-service.ts` is **not** a general-purpose logger: it is scoped to a
single tRPC call (it requires a `sessionId` + `userId`, aggregates per-session
stats, and exports each call to Datadog via `lib/datadog-service.ts`). Routing
~314 ad-hoc `console.*` statements — in queue handlers, workflows, factories,
webhooks — through it would be a category error.

## Decision

**Introduce `lib/logger.ts`, a small structured logger, as the sink for general
server logging. Keep `lib/logging-service.ts` for tRPC-call telemetry.**

- `logger.{debug,info,warn,error}(message, ...rest)` emits one structured JSON
  line per call. On Cloudflare Workers, `console.*` stdout/stderr **is** the log
  transport (captured by `wrangler tail` / logpush), so the logger formats a JSON
  entry and writes it through exactly one `console.*` per level. Those handful of
  `console.*` calls (inside `logger.ts`) are the only ones that remain, by design.
- It is dependency-free and never throws (a serialization failure falls back to a
  plain string). It does **not** import `@sentry/cloudflare` — see ADR 0005 for
  why; unhandled request errors are captured at the worker boundary instead.
- The whole-perimeter sweep replaced `console.log|info → logger.info`,
  `console.error → logger.error`, `console.warn → logger.warn`,
  `console.debug|trace → logger.debug`, preserving every call's arguments.

## Consequences

- Perimeter `console.*` (excluding `logger.ts`'s own sinks) drops to 0.
- `logging-service.ts` keeps its role: per-tRPC-call stats → Datadog.
- Structured JSON logs are greppable in `wrangler tail` / logpush.
