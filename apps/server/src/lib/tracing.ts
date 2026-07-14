// lib/tracing.ts — OpenTelemetry tracer façade (A5).
//
// `initTracing()` returns the global @opentelemetry/api tracer. Standalone it is a
// documented no-op (no TracerProvider is registered), which is a safe default: the spans
// callers create on the queue/workflow/webhook paths are cheap and inert until an exporter
// is wired. Real, structured tracing on the tRPC REQUEST path already exists via
// lib/trace-context.ts (timing + attributes + error status, exported through the tRPC
// logging middleware). A real OTLP exporter for the async paths is available through
// @microlabs/otel-cf-workers (already in deps) + the optional OTEL_EXPORTER_OTLP_* env, and
// is deferred as orthogonal to A5's error-handling scope. Decision recorded in
// docs/adr/0003-tracing-strategy.md.
import { trace, type Tracer } from '@opentelemetry/api';

export const initTracing = (): Tracer => {
  return trace.getTracer('zero-email-server', '1.0.0');
};
