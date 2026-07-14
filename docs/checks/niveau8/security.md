# Check — security level 8

PASS only if:

- Installed Better Auth is outside applicable published vulnerable ranges and auth compiles/tests.
- `mail.google.com` is absent from runtime OAuth scopes; the remaining scope union is justified.
- Agent registry/schema tests prove no send, permanent-delete, spam, OAuth, or settings tool.
- MCP draft/outbox tests cover cross-user denial, sanitization, idempotency, and bounded inputs.
- Targeted source scan finds no credential-like additions in the branch diff.
- Production audit has zero untriaged critical advisory. Every remaining high advisory has package,
  path, runtime reachability, mitigation, and follow-up owner in the saved report.
- CI includes targeted frontend/server build or type gates, security-surface tests, audit reporting,
  and secret scanning without project-wide formatting.
- Worker code touched by this run has no request-scoped mutable global or floating promise.

