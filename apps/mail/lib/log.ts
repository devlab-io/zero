// lib/log.ts — front logging sink (A5 observability, apps/mail twin of the server
// logger #29 / ADR 0004).
//
// Why a front logger at all: it centralises the ~120 scattered console calls in apps/mail
// onto one seam, exactly as `apps/server/src/lib/logger.ts` did server-side. The rest of
// apps/mail routes through `log.*` instead of raw console calls; the only native console
// methods that remain (by design) are the four sinks below.
//
// Two deliberate divergences from the server logger, both justified by the front context:
//
//  1. No JSON serialization — args are forwarded VERBATIM to the browser, never stringified.
//     The server logger stringifies to a single JSON line because Cloudflare Workers
//     stdout/stderr is the log transport (logpush). In the browser, devtools IS the surface a
//     developer
//     reads, so passing raw args through keeps devtools object-inspection intact AND makes
//     `log.warn`/`log.error` byte-identical in output to the native calls they replaced —
//     zero behaviour change.
//
//  2. `debug`/`info` are no-op in production (`import.meta.env.DEV` gate). Server logs are
//     an ops stream; the browser console is a USER-VISIBLE surface, so development debug
//     noise must not ship. `warn`/`error` are NEVER gated — an error signal that used to
//     reach the browser still reaches it in every environment.
//
// Dependency-free and never throws. It does NOT import `@sentry/react`: client Sentry is
// opt-in (VITE_PUBLIC_SENTRY_DSN, off by default) and dynamically imported to stay out of
// the critical bundle (w2cd). Forwarding warn/error to Sentry when a DSN exists — mirroring
// the hand-rolled pattern in app/entry.client.tsx — is a named follow-up for the owner, to
// wire only once a DSN is actually configured; until then it would be dead weight.

export const log = {
  debug(...args: unknown[]): void {
    if (import.meta.env.DEV) console.debug(...args);
  },
  info(...args: unknown[]): void {
    if (import.meta.env.DEV) console.info(...args);
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
