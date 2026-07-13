# Claude Code / Claude Desktop setup for Zero MCP (draft-only)

This guide wires a Claude Code or Claude Desktop MCP client to the Zero MCP endpoint
for the draft-only workflow. The agent may inspect mail context, compose proposed
replies, create Gmail drafts, and enqueue/inspect/cancel/retry reviewable outbox items.
**It cannot send mail, permanently delete mail, report spam, or change account
settings** — those surfaces are not registered.

The tool surface is identical to the Codex setup (`docs/agent/codex-setup.md`); the
authoritative, machine-readable schema is committed at
`docs/agent/mcp-schema.snapshot.json`.

## Config — Claude Code (CLI)

Zero MCP is a remote streamable-HTTP server behind a better-auth OIDC login. Add it and
authenticate through the browser flow (no bearer token is stored in plaintext):

```bash
# ${ZERO_MCP_HOST} is a placeholder — e.g. zero.example.dev. Never commit a real host+token.
claude mcp add --transport http zero "https://${ZERO_MCP_HOST}/mcp"

# Then, inside Claude Code, run the OAuth login for the "zero" server:
#   /mcp        → select "zero" → Authenticate
```

## Config — Claude Desktop

Add the server to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`). A versioned example
is checked in at `docs/agent/claude-config.example.json`:

```json
{
  "mcpServers": {
    "zero": {
      "type": "http",
      "url": "https://${ZERO_MCP_HOST}/mcp"
    }
  }
}
```

Restart Claude Desktop; the OAuth login is triggered on first connect. Use only
environment-style placeholders in any committed config — never a real host embedded
with a token.

## Draft-only contract

Call `getServerCapabilities` first — it returns, as JSON, the hard guarantees
`canSendMail:false`, `canPermanentlyDeleteMail:false`, `canReportSpam:false`,
`canChangeAccountSettings:false`. The agent must stop at Gmail draft creation or outbox
queuing; final sending belongs to a human action in Zero `/queue`.

## Read-only smoke test

After authenticating, prove discovery and a read-only path without touching mail. In
Claude Code:

```
> Use the zero MCP server: call getServerCapabilities and list the available tools.
> Then call getConnections and listThreads on inbox (maxResults 5). Do not create any
> draft or outbox item.
```

Expected: `getServerCapabilities` reports `canSendMail:false`; `listThreads` returns
compact rows (subject/id/date/sender), no message bodies; no draft or outbox item is
created.

## Draft-only smoke test

```
> Use the zero MCP server. Prepare 2 pending replies on compta@: create the Gmail drafts
> with createDraft (or enqueue them with enqueueDraftJob). Send nothing.
```

Verify draft-only output:

- Gmail drafts were created (ids returned by `createDraft`) or outbox items exist
  (`listOutbox` shows status `queued`/`draft_ready`).
- Idempotency: repeating `enqueueDraftJob` with identical fields, or `createDraft` with
  the same `idempotencyKey`, returns the same id — no duplicate.
- Zero sends: no new Sent item; the surface exposes no send tool, so this is guaranteed
  structurally.

A machine-checked local run of these two paths (with injected driver fakes, no network)
is saved at `docs/agent/mcp-smoke.evidence.json`; see `docs/agent/mcp-smoke.md` for the
full procedure and the live-session blocker note.

## Human approval boundary

Sending is a separate human action in Zero `/queue`: a reviewer approves an outbox item
(15 s countdown → `sent`) or cancels it (`cancelled`). No agent tool can perform or
shortcut that send.
