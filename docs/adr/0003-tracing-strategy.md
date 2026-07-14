# ADR 0003 — Tracing strategy (statue lib/tracing.ts)

- Status: Accepted
- Date: 2026-07-13
- Issue: devlab-io/zero#29 — [niveau9] V3.4 server-runtime-guardrails
- Scope: `apps/server` tracing surface only. No behaviour change to request handling.

## Context

Check `observability.md` §5 requires `lib/tracing.ts` to be either implemented with
real spans on the tRPC path OR removed with an ADR — no dead stub may remain.

Facts established in PHASE 0:

- `lib/tracing.ts` was a 9-line file exporting `initTracing()` (a global
  `@opentelemetry/api` tracer) and `createSpan()`.
- `createSpan` had **zero callers** (dead export).
- `initTracing()` has **four live callers** that create real spans:
  `main.ts` (thread-queue), `routes/index.ts` (a8n webhook), `pipelines.ts`
  (`workflow_main`), `thread-workflow-utils/workflow-engine.ts`
  (`workflow_execution`). None are on the tRPC request path.
- The tRPC REQUEST path already has real, structured tracing via
  `lib/trace-context.ts` — spans with timing, attributes and error status,
  wired through the tRPC logging middleware (`lib/trpc-logging.ts`) and exported
  to Datadog.
- Standalone, `@opentelemetry/api`'s global tracer is a documented no-op until a
  `TracerProvider` is registered. `@microlabs/otel-cf-workers` (a real OTLP
  exporter) is in `apps/server` deps but is **not** wired in `src`.

## Decision

**Keep `lib/tracing.ts` as a documented OpenTelemetry façade; remove the dead
`createSpan` export.**

- The tRPC path's "real spans" requirement is satisfied by `lib/trace-context.ts`
  (unchanged) — that is the request-path tracer of record.
- `lib/tracing.ts` remains the façade the async (queue/workflow/webhook) paths
  use. Its spans are cheap and inert until an exporter is registered, which is a
  safe default rather than a dead stub — the four call sites are live.
- Wiring a real OTLP exporter for the async paths (via `@microlabs/otel-cf-workers`
  + the optional `OTEL_EXPORTER_OTLP_*` env already typed in `env.ts`) is
  **deferred**: it means wrapping the worker entrypoint and is orthogonal to
  V3.4's error-handling scope. It carries no code today, so nothing is dead.

## Consequences

- `createSpan` (dead) is deleted; `initTracing` (live) stays.
- No lockfile change; no restructuring of `pipelines.ts` (#31's file).
- A follow-up may register `@microlabs/otel-cf-workers` to make the async-path
  spans export to an OTLP endpoint.
