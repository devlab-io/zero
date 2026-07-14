# Claude Code and Claude Connectors setup for Zero MCP

Zero MCP supports a bounded **read → create unsent reply draft → fetch → revise the same
draft → human review** workflow. It exposes no tool that can send, approve, permanently
delete, mark spam, or change account settings.

This guide was checked on 2026-07-14 against Claude Code 2.1.209, the current
[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp), and the current
[Claude connector OAuth documentation](https://claude.com/docs/connectors/building/authentication).
It does not claim a deployment, production connection, OAuth consent, or live production
smoke.

## Claude Code

Add a project-scoped remote HTTP server (all options precede the server name):

```bash
claude mcp add --transport http --scope project zero "https://YOUR-ZERO-ORIGIN/mcp"
```

The equivalent `.mcp.json` shape is in `claude-config.example.json`. Claude Code prompts
before trusting a project-scoped server. Inspect the exact HTTPS URL before approving it.

Authenticate only when ready to review the provider consent screen:

```bash
claude mcp login zero
```

You can also use `/mcp` → `zero` → Authenticate. OAuth requires the server's 401 challenge,
protected-resource metadata whose `resource` exactly matches the configured MCP URL, and
authorization-server discovery. Cancel if the discovered issuer or scopes are unexpected.

### Tool allowlist and write approvals

Copy the `permissions` object from `claude-settings.example.json` into
`.claude/settings.json`. It allows only the bounded read tools, places
`setActiveConnection`, `createReplyDraft`, and `updateDraft` in `permissions.ask`, and
denies every other Zero MCP tool. Claude evaluates deny before ask before allow, so the two
draft writes always require a visible approval prompt under this policy.

Do not use `bypassPermissions` with Zero MCP. Review the active account, recipients,
subject, thread, and body at each write approval.

Use this sequence:

1. `getServerCapabilities`, then confirm all forbidden capabilities are `false`.
2. Select the intended owned account with `getConnections`, `getActiveConnection`, and an
   explicitly approved `setActiveConnection` if needed.
3. Find a thread, then call `getThreadContext`; it returns at most 20 sanitized messages
   and 64 KiB of text, without attachments or raw headers.
4. Approve `createReplyDraft` with a thread ID, body, and unique 1–128 character
   idempotency key. Recipients, subject, and threading are server-derived.
5. Call `getDraft`, review the projection, and retain its opaque revision.
6. Approve `updateDraft` for the same ID with that revision, revised body, and a new key.
   A stale revision changes nothing. Review the resulting unsent draft in Zero.

## Claude Desktop and hosted Claude

Do not edit `claude_desktop_config.json` for this remote connector. In Claude Desktop or
claude.ai, open **Settings → Connectors**, choose the custom connector/add-connector flow,
and enter the exact `https://YOUR-ZERO-ORIGIN/mcp` URL. Hosted Claude surfaces require an
interactive OAuth consent and use `https://claude.ai/api/mcp/auth_callback`; connector
availability and who may add it depend on the workspace plan and admin policy.

The local Claude Code permission file does not govern hosted connectors. Configure the
hosted workspace's connector/tool policy separately and keep both draft writes
human-approved.

## Optional AI composition

The recommended policy denies `composeEmail`. It is the only tool that may send supplied
content to an external AI provider and permit public web search. Opt in only by moving its
exact tool name from `deny` to `ask`, then call it with `allowWebSearch=true` after explicit
egress approval. It returns text and creates no draft.

## Verification boundary

The checked-in proof is local and in-process: the installed Streamable HTTP transport runs
against realistic fakes with no OAuth consent, production credentials, provider network,
deploy, or send path. See `mcp-smoke.md` and `mcp-smoke.evidence.json`. A hosted connector
or live-account smoke is a separate human-authorized action.
