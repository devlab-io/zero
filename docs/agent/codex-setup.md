# Codex CLI setup for Zero MCP

This guide wires a local Codex CLI agent, version 0.142 or newer, to the Zero MCP
endpoint for the tartine draft-only workflow. The agent may inspect mail context,
compose proposed replies, create Gmail drafts, and enqueue draft jobs. It must
not send mail.

## Config

Add the Zero MCP server to `~/.codex/config.toml`. Keep any existing top-level
Codex settings already in that file, then add this block:

```toml
# ~/.codex/config.toml

[mcp_servers.zero]
url = "https://<zero-deployment-host>/mcp"
```

Use the deployed Zero origin and append `/mcp` exactly, for example
`https://zero.example.dev/mcp`. A versioned snippet is checked in at
`docs/agent/codex-config.example.toml`.

Authenticate the MCP server through the current better-auth OIDC flow:

```bash
codex mcp login zero
```

The better-auth MCP OIDC plugin is a watch item in tartine T3 and is expected to
be deprecated in favor of the OAuth Provider Plugin, so re-check that caveat
before changing the auth wiring.

## Draft-only warning

This MCP server is draft-only: no send tool is exposed. The agent must stop at
Gmail draft creation or outbox queuing; final sending belongs to a human action
in Zero.

The registered MCP tool surface in `apps/server/src/routes/agent/mcp.ts` at the
tartine wave3 base is:

- `getConnections`
- `getThreadSummary`
- `getActiveConnection`
- `setActiveConnection`
- `composeEmail`
- `createDraft` - creates a Gmail draft for later human review, with optional
  `threadId` for replies in an existing thread.
- `enqueueDraftJob` - queues a draft job in the outbox for later human review.
- `listThreads`
- `getThread`
- `markThreadsRead`
- `markThreadsUnread`
- `modifyLabels`
- `getCurrentDate`
- `getUserLabels`
- `getLabel`
- `createLabel`

Deliberately absent: `sendEmail`, `sendDraft`, `drafts.send`, or any other send
tool. `composeEmail` only returns composed text; `createDraft` creates a Gmail
draft; `enqueueDraftJob` creates an outbox item that still requires human
approval.

## Mission prompts

Run missions manually with `codex exec` after login. Examples:

```bash
codex exec "prépare les réponses en attente de compta@, crée les brouillons Gmail, et n'envoie rien"
codex exec "tri les 5 derniers fils de compta@ et enqueue les réponses qui nécessitent validation humaine"
codex exec "prépare 2 réponses en attente sur compta@ via Zero MCP, puis résume les drafts créés"
```

When a mission may touch multiple mailboxes, start by asking the agent to call
`getConnections` and `setActiveConnection` before reading threads or creating
drafts.

## Manual E2E procedure

The `/queue` view may arrive from the tartine queue-view slice after this docs
slice. Execute this procedure once that route is available, using the behavior
specified in `docs/spec/agent-draft-queue.md`.

1. Log in to Zero MCP:

   ```bash
   codex mcp login zero
   ```

2. Run a manual mission:

   ```bash
   codex exec "prépare 2 réponses en attente sur compta@, crée ou enqueue les brouillons, et n'envoie rien"
   ```

3. Verify the agent stopped at draft-only output:

   - Gmail drafts were created for the target account.
   - Matching outbox items exist with status `draft_ready`.
   - There were zero sends: no new Sent item and no send-side confirmation for
     the drafts at this point.

4. Open Zero `/queue` and review the two outbox items:

   - Approve one item. It should enter the 15 second countdown and then become
     `sent`.
   - Undo or cancel the other during the countdown. It should become
     `cancelled`.

5. Confirm on the Gmail side:

   - The approved draft was sent and appears in Sent mail.
   - The cancelled item was not sent.
   - There is no extra send beyond the single human-approved item.
