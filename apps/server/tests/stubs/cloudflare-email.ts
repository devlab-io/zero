// Vitest stub for the `cloudflare:email` builtin, unavailable in Node. The `agents`
// package imports `EmailMessage` at module load; nothing under test constructs one.
export class EmailMessage {
  constructor(
    public from: string,
    public to: string,
    public raw: unknown,
  ) {}
}
