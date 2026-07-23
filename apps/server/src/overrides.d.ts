// Local type shim for the native Workers Traces custom-span API
// (changelog 2026-06-16). The pinned @cloudflare/workers-types version
// predates it; remove this file once the types catch up. Signature per the
// official declarations: callback-style, span auto-ends when the callback
// settles, attributes via span.setAttribute (no options object, no end()).
// The API is typed as possibly-undefined so call sites must feature-check
// before use (the vitest Node stub exports tracing as undefined).
declare module 'cloudflare:workers' {
  export interface ZeroTracingSpan {
    readonly isTraced: boolean;
    setAttribute(key: string, value: string | number | boolean | undefined): void;
  }
  export const tracing:
    | {
        enterSpan<T>(name: string, callback: (span: ZeroTracingSpan) => T): T;
      }
    | undefined;
}
