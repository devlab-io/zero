# Claude Code and Claude Connectors setup for Zero MCP

Zero MCP supports a bounded **read → create unsent reply draft → fetch → human review**
workflow. Revising the same draft is enabled only for a provider that exposes a native,
atomic conditional write tied to the returned revision. It exposes no tool that can send, approve, permanently
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
`setActiveConnection` and `createReplyDraft` in `permissions.ask`, and denies every other
Zero MCP tool, including `updateDraft` until provider CAS is proven. Claude evaluates deny
before ask before allow, so draft creation always requires a visible approval prompt.

Do not use `bypassPermissions` with Zero MCP. Review the active account, recipients,
subject, thread, and body at each write approval.

Use this sequence:

1. `getServerCapabilities`, then confirm all forbidden capabilities are `false` and inspect
   `draftUpdate`. Google/Gmail and Microsoft are currently reported as `supported: false`
   because their integrated public write paths do not provide proven provider-native atomic CAS.
2. Select the intended owned account with `getConnections`, `getActiveConnection`, and an
   explicitly approved `setActiveConnection` if needed.
3. Find a thread, then call `getThreadContext`; it returns at most 20 sanitized messages
   and 64 KiB of text, without attachments or raw headers.
4. Approve `createReplyDraft` with a thread ID, body, and unique 1–128 character
   idempotency key. Recipients, subject, and threading are server-derived.
5. Call `getDraft`, review the projection, opaque revision, and `updateCapability`.
6. Only when `draftUpdate.supported=true`, move the exact `mcp__zero__updateDraft` tool from
   `deny` to `ask`, then approve the same-ID update with the current revision and a new key.
   A stale or concurrent provider edit is rejected atomically.
7. When support is `false`, leave `updateDraft` denied. Create a new unsent draft with a fresh
   key, review both drafts in Zero, and let the human retain the intended one.

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
against a provider-CAS fake and a no-CAS fake, including a concurrent-edit 412-equivalent,
with no OAuth consent, production credentials, provider network, deploy, or send path. See
`mcp-smoke.md` and `mcp-smoke.evidence.json`. A hosted connector
or live-account smoke is a separate human-authorized action.
