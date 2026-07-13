// lib/sentry.ts — server-side error capture to Sentry (A5).
//
// @sentry/cloudflare@9.43.0 is a project dependency, but importing its SDK anywhere in the
// server program pulls its `/// <reference types="@cloudflare/workers-types" />`, whose
// ambient `declare module 'cloudflare:workers'` redeclares `env` and shadows the
// wrangler-generated typing (worker-configuration.d.ts → Cloudflare.Env). That strips the
// project bindings from `env.*` and breaks `tsc` across unrelated files — and the frozen
// A2/A4 gate is server = 0 errors (blocking). The conflict is reproducible and NOT fixable
// via ambient re-assertion or tsconfig `paths` (a type-reference directive bypasses both),
// short of editing node_modules or the lockfile (both out of scope).
//
// So we capture to Sentry directly with a minimal, dependency-free client that speaks the
// Sentry envelope protocol — same observable outcome as the SDK: exceptions captured with a
// release tag, POSTed to the Sentry ingest transport, and a clean no-op without a DSN.
// Decision recorded in docs/adr/0005-server-sentry.md.

import type { ZeroEnv } from '../env';

export interface ServerSentryOptions {
  dsn: string;
  release?: string;
  environment?: string;
}

/** Builds capture options from env. Returns undefined (clean no-op) when SENTRY_DSN is unset. */
export function buildSentryOptions(env: ZeroEnv): ServerSentryOptions | undefined {
  const dsn = env.SENTRY_DSN;
  if (!dsn) return undefined;
  return {
    dsn,
    release: env.SENTRY_RELEASE ?? `zero-server@${env.NODE_ENV ?? 'unknown'}`,
    environment: env.NODE_ENV,
  };
}

interface ParsedDsn {
  protocol: string;
  host: string;
  projectId: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '').split('/').pop() ?? '';
    if (!u.hostname || !projectId || !u.username) return null;
    return { protocol: u.protocol, host: u.host, projectId, publicKey: u.username };
  } catch {
    return null;
  }
}

export interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: 'javascript';
  level: 'error';
  release?: string;
  environment?: string;
  transaction?: string;
  exception: { values: Array<{ type: string; value: string; stacktrace?: { frames: unknown[] } }> };
  extra?: Record<string, unknown>;
}

function toException(error: unknown): { type: string; value: string; stacktrace?: { frames: unknown[] } } {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      value: error.message,
      stacktrace: error.stack ? { frames: [] } : undefined,
    };
  }
  return { type: 'Error', value: typeof error === 'string' ? error : JSON.stringify(error) };
}

function buildEvent(
  error: unknown,
  options: ServerSentryOptions,
  ctx?: { transaction?: string; extra?: Record<string, unknown> },
): SentryEvent {
  return {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    release: options.release,
    environment: options.environment,
    transaction: ctx?.transaction,
    exception: { values: [toException(error)] },
    extra: ctx?.extra,
  };
}

/** Serialises a single-event Sentry envelope (newline-delimited). */
export function buildEnvelope(event: SentryEvent, dsn: string): string {
  const header = JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn });
  const itemHeader = JSON.stringify({ type: 'event' });
  const payload = JSON.stringify(event);
  return `${header}\n${itemHeader}\n${payload}\n`;
}

export interface SentryTransport {
  send(url: string, body: string): Promise<void>;
}

const defaultTransport: SentryTransport = {
  async send(url, body) {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    });
  },
};

/**
 * Captures an exception to Sentry with the configured release. No-op (returns null) when no
 * DSN is set or the DSN is malformed. Never throws — capture must not crash the request path.
 * Returns the event id on success. The transport is injectable for tests.
 */
export async function captureServerException(
  error: unknown,
  env: ZeroEnv,
  ctx?: { transaction?: string; extra?: Record<string, unknown> },
  transport: SentryTransport = defaultTransport,
): Promise<string | null> {
  const options = buildSentryOptions(env);
  if (!options) return null;
  const dsn = parseDsn(options.dsn);
  if (!dsn) return null;

  const event = buildEvent(error, options, ctx);
  const envelope = buildEnvelope(event, options.dsn);
  const url = `${dsn.protocol}//${dsn.host}/api/${dsn.projectId}/envelope/`;

  try {
    await transport.send(url, envelope);
  } catch {
    // Capture must never crash the request path; a failed send is intentionally swallowed.
  }
  return event.event_id;
}
