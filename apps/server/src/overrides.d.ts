// Local type shim for the native Workers Traces custom-span API
// (changelog 2026-06-16). The pinned @cloudflare/workers-types version
// predates it; remove this file once the types catch up. The API is typed
// as possibly-undefined so call sites must feature-check before use.
declare module 'cloudflare:workers' {
  export interface ZeroSpanOptions {
    attributes?: Record<string, string | number | boolean | undefined>;
  }
  export interface ZeroSpanHandle {
    end(attributes?: Record<string, string | number | boolean | undefined>): void;
  }
  export const tracing:
    | {
        enterSpan(name: string, options?: ZeroSpanOptions): ZeroSpanHandle;
      }
    | undefined;
}
