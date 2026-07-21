// Vitest stub for the `cloudflare:workers` builtin, unavailable in Node.
// Only the surface used by code under test is provided. `tracing` is
// intentionally undefined: call sites feature-check before creating spans.
export const tracing = undefined;

export class DurableObject<Env = unknown> {
  constructor(
    public ctx: unknown,
    public env: Env,
  ) {}
}

export const env = {} as never;
