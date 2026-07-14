# Codex CLI setup for Zero MCP (draft-only)

This guide wires a local Codex CLI agent, version 0.142 or newer, to the Zero MCP
endpoint for the draft-only workflow. The agent may inspect mail context, compose
proposed replies, create Gmail drafts, and enqueue/inspect/cancel/retry reviewable
outbox items. **It cannot send mail, permanently delete mail, report spam, or change
account settings** — those surfaces are not registered.

## Config

Add the Zero MCP server to `~/.codex/config.toml`. Keep any existing top-level
Codex settings already in that file, then add this block:

```toml
# ~/.codex/config.toml

[mcp_servers.zero]
url = "https://${ZERO_MCP_HOST}/mcp"
```

`${ZERO_MCP_HOST}` is a placeholder for the deployed Zero origin (for example
`zero.example.dev`) — **never commit a real host with an embedded token**. A
versioned snippet is checked in at `docs/agent/codex-config.example.toml`.

Authenticate the MCP server through the current better-auth OIDC flow (this opens a
browser login; no bearer token is stored in the config file):

```bash
codex mcp login zero
```

The better-auth MCP OIDC plugin is a watch item and is expected to be deprecated in
favor of the OAuth Provider Plugin, so re-check that caveat before changing the auth
wiring.

## Draft-only contract

This MCP server is draft-only. Call `getServerCapabilities` first — it returns, as
JSON, the hard guarantees `canSendMail:false`, `canPermanentlyDeleteMail:false`,
`canReportSpam:false`, `canChangeAccountSettings:false`. The agent must stop at Gmail
draft creation or outbox queuing; final sending belongs to a human action in Zero.

The registered MCP tool surface in `apps/server/src/routes/agent/mcp.ts` (the exact,
machine-readable schema is committed at `docs/agent/mcp-schema.snapshot.json`) is:

Read:

- `getServerCapabilities` — health/capabilities + draft-only guarantees. Stores nothing.
- `getConnections` — linked accounts (email + provider).
- `getActiveConnection` / `setActiveConnection` — read/select the active account. Selection
  changes no account setting.
- `listThreads` — COMPACT thread metadata (subject/id/date/sender/unread/labels); never bodies.
- `searchThreads` — COMPACT thread metadata for a search; never bodies.
- `getThread` — one thread on demand (sanitized latest message text).
- `getThreadSummary` — short AI summary for one thread.
- `getUserLabels` / `getLabel` — list labels / one label.
- `getCurrentDate` — server date/time.
- `composeEmail` — returns AI-drafted body TEXT only; creates/stores/sends nothing.
- `listOutbox` / `getOutboxItem` — inspect reviewable outbox draft jobs the user owns.

Write (draft-only, idempotent):

- `createDraft` — creates a Gmail draft stored in Gmail Drafts for later human review,
  with optional `threadId` for replies and an optional `idempotencyKey` (repeat calls
  return the same draft).
- `enqueueDraftJob` — stores a reviewable outbox job (status `queued`); duplicate calls
  with identical fields return the same item.
- `cancelOutboxItem` / `retryOutboxItem` — cancel a pending / retry a failed outbox job
  (idempotent; other-user or missing ids return an identical not-found).

Deliberately absent: `sendEmail`, `sendDraft`, `drafts.send`, `bulkDelete`,
`deleteThread`, `deleteLabel`, `deleteAllSpam`, `markThreadsRead`/`markThreadsUnread`,
`modifyLabels`, `createLabel`, or any send / permanent-delete / spam / account-setting
tool. `composeEmail` only returns text; `createDraft` creates an unsent draft;
`enqueueDraftJob` creates an outbox item that still requires human approval.

## Read-only smoke test

After `codex mcp login zero`, prove discovery and a read-only path without touching mail:

```bash
# 1. Discovery — initialize + list tools; confirm the surface above is returned.
codex exec "connecte-toi à Zero MCP, appelle getServerCapabilities et liste les outils disponibles"

# 2. Read-only — no write tool is invoked.
codex exec "via Zero MCP: getConnections, puis listThreads sur inbox (maxResults 5) en résumé compact — ne crée ni draft ni outbox"
```

Expected: `getServerCapabilities` reports `canSendMail:false`; `listThreads` returns
compact rows (subject/id/date/sender), no message bodies; no draft or outbox item is
created.

## Draft-only smoke test

```bash
codex exec "prépare 2 réponses en attente sur compta@ via Zero MCP, crée les brouillons Gmail (createDraft) ou enqueue (enqueueDraftJob), et n'envoie rien"
```

Verify the agent stopped at draft-only output:

- Gmail drafts were created for the target account (ids returned by `createDraft`), or
  matching outbox items exist (`listOutbox` shows status `queued`/`draft_ready`).
- Idempotency: repeating the same `enqueueDraftJob` (identical fields) or a `createDraft`
  with the same `idempotencyKey` returns the same id — no duplicate.
- There were zero sends: no new Sent item and no send-side confirmation. The surface
  exposes no send tool, so this is structurally guaranteed.

A machine-checked local run of these two paths (with injected driver fakes, no network)
is saved at `docs/agent/mcp-smoke.evidence.json`; see `docs/agent/mcp-smoke.md` for the
full procedure and the live-session blocker note.

## Human approval boundary (`/queue`)

Sending remains a separate human action. In Zero `/queue`, a reviewer approves an
outbox item (15 s countdown → `sent`) or cancels it (`cancelled`). No agent tool can
perform or shortcut that send.
