### Zero MCP

The MCP surface is implemented in `apps/server/src/routes/agent/mcp.ts` (the `ZeroMCP` Durable
Object) and `apps/server/src/routes/agent/mcp-tools.ts` (draft-only tool surface, issue #36).

## Capabilities

Zero MCP is **draft-only**. Verbatim contract (from the committed snapshot
`docs/agent/mcp-schema.snapshot.json`):

> This MCP server is draft-only. No tool can send mail, permanently delete mail, report spam, or
> change account settings. Agent output stops at a Gmail draft or a reviewable outbox item; a human
> in Zero performs any send.

**Hard guarantees** (snapshot flags): `canSendMail: false`, `canPermanentlyDeleteMail: false`,
`canReportSpam: false`, `canChangeAccountSettings: false`. The CI guard
`scripts/security/check-agent-surface.mjs` asserts these capabilities stay absent — there is **no**
send, delete, spam, label-mutation, or account-settings tool.

The published surface is **18 tools** (14 read, 4 write). Sources of truth:
`apps/server/src/routes/agent/mcp-tools.ts` (`MCP_TOOL_DEFINITIONS` + `mcpToolDescriptions`) and the
snapshot `docs/agent/mcp-schema.snapshot.json`. Write tools are strictly limited to draft creation
and reviewable-outbox management.

### Read tools (14) — never mutate, never send

- **getServerCapabilities** — report server health + the draft-only hard guarantees, as JSON.
- **getConnections** — list linked accounts (email address + provider only).
- **getActiveConnection** — the account currently selected for subsequent tools.
- **setActiveConnection** — select the active account in-session by email; changes no account setting and never sends.
- **listThreads** — compact thread metadata only (subject, id, date, sender, unread, labels); never bodies/attachments.
- **searchThreads** — search threads → compact metadata only.
- **getThread** — one thread on demand: subject/date/sender + sanitized text of the latest message.
- **getThreadSummary** — short AI summary + subject/sender/date for one thread.
- **getUserLabels** — list labels (name, id, color). Read-only.
- **getLabel** — get one label by id.
- **getCurrentDate** — current server date/time.
- **composeEmail** — draft a body with AI and RETURN it as text only; creates no draft, stores nothing, never sends.
- **listOutbox** — list the user's outbox draft jobs (id, status, subject, thread, timestamps).
- **getOutboxItem** — inspect one outbox draft job the user owns, by id.

### Write tools (4) — draft/outbox only, idempotent, never send

- **createDraft** — create an UNSENT Gmail draft for later human review (`idempotencyKey` dedups retries); never sends.
- **enqueueDraftJob** — store a reviewable outbox job (status `queued`); a human approves in Zero before anything is sent; never sends.
- **cancelOutboxItem** — cancel an outbox job the user owns while queued/generating/draft_ready/approved; idempotent; never sends.
- **retryOutboxItem** — re-queue a FAILED outbox job for another generation attempt; idempotent; never sends.

**Sending model:** agent output stops at a Gmail draft or a reviewable outbox item. Any actual send is
a separate human action inside Zero — it is impossible through this MCP surface by construction.

## How to use?

You can connect to ZeroMCP using two methods:

1. Better Auth session token
2. OAuth (Coming soon)

## Better Auth session token

Copy the session cookie from your browser cookies and place it into the Authorization header. You can copy the entire cookie field used in Zero webapp and it will work. Or you can use the format: `better-auth-{env}.session_token={value}`.
Replace `env` with `dev` for local development, `value` is your session token.
