# Check — open Codex and Claude agent API

PASS only if:

- MCP initialize/list-tools succeeds with authentication and returns stable JSON schemas.
- Read tools cover capabilities, connections, compact thread list/search, thread-by-id, and labels.
- Write tools are limited to create draft and reviewable outbox create/inspect/cancel/retry.
- Tool descriptions explicitly state that no tool sends mail.
- Duplicate create/enqueue calls with one idempotency key produce one logical result.
- Cross-user connection, draft, and outbox identifiers are rejected without revealing existence.
- `docs/agent/codex-setup.md` and Claude setup documentation use environment placeholders, never
  real tokens, and include a read-only smoke test plus a draft-only smoke test.
- Saved smoke evidence demonstrates both client configurations against local or staging without
  sending a message.

