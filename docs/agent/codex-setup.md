# Codex setup for Zero MCP

Zero MCP supports a bounded **read → create unsent reply draft → fetch → revise the same
draft → human review** workflow. It exposes no tool that can send, approve, permanently
delete, mark spam, or change account settings.

This guide was checked on 2026-07-14 against Codex CLI 0.144.1 and the current
[official Codex MCP documentation](https://developers.openai.com/codex/mcp). It documents
configuration only; it does not claim a deployment, production connection, OAuth consent,
or live production smoke.

## Configure the remote HTTP server

Either copy `codex-config.example.toml` into `~/.codex/config.toml` and replace the
`.invalid` URL, or run:

```bash
codex mcp add zero --url "https://YOUR-ZERO-ORIGIN/mcp"
```

The checked-in TOML sets `auth = "oauth"`, a narrow `enabled_tools` allowlist, and
`default_tools_approval_mode = "writes"`. The allowlist enables only account selection,
bounded thread/draft reads, `createReplyDraft`, and `updateDraft`; it excludes the optional
AI composer and the older generic/outbox tools.

Start OAuth only when you are ready to review the provider consent screen:

```bash
codex mcp login zero
```

Then use `codex mcp list` or `/mcp` in the TUI to inspect the connection. Do not paste a
bearer token into the TOML. If the server URL or discovered OAuth issuer is unexpected,
cancel the login.

## Approval and safe workflow

`default_tools_approval_mode = "writes"` uses the server annotations to prompt before
non-read-only tools. Confirm the active account, recipients, subject, thread, and body in
the approval UI. Never change the mode to `approve` for this server.

Use this sequence:

1. `getServerCapabilities`; verify all four forbidden capabilities are `false`.
2. `getConnections`, then `getActiveConnection`; use `setActiveConnection` only after
   confirming the intended owned account.
3. `searchThreads`/`listThreads`, then `getThreadContext` for one thread. Context is at
   most 20 sanitized messages and 64 KiB of text, with no attachments or raw headers.
4. `createReplyDraft` with only `threadId`, body, and a unique 1–128 character
   `idempotencyKey`. The server derives sender exclusions, To/Cc, subject, and threading.
5. `getDraft`; review its owned projection and retain the opaque `revision`.
6. `updateDraft` with the same draft ID, that revision, revised body, and a new idempotency
   key. A stale revision changes nothing. Review the final unsent draft in Zero.

Repeated calls with the same key and payload deduplicate. Reusing a key with a changed
payload conflicts before provider mutation.

## Optional AI composition

`composeEmail` is intentionally outside the recommended allowlist. It is the only Zero MCP
tool that may send supplied content to an external AI provider and permit public web search.
To opt in, add `composeEmail` to `enabled_tools`, keep write approvals enabled, and call it
only with `allowWebSearch=true` after the user explicitly approves that egress. It returns
text and creates no draft.

## Verification boundary

The repository proof is local and in-process: `mcp-draft-loop.test.ts` uses the installed
Streamable HTTP transport and realistic fakes to prove initialization, tool listing,
bounded read, create, get, same-ID update, forbidden-tool absence, and zero send calls.
See `mcp-smoke.md` and `mcp-smoke.evidence.json`. A real OAuth login or hosted smoke remains
a separate, explicit human-authorized action.
