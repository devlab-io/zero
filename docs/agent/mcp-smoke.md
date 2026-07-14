# Zero MCP — draft-only smoke evidence (Claude + Codex)

Scope: prove the draft-only "Claude and Codex API" surface for both client
configurations — a read-only path and a draft-only path — **without sending a
message**. Issue devlab-io/zero#36.

Artifacts in this folder:

- `mcp-schema.snapshot.json` — committable snapshot of the whole tool surface
  (name, category, mutates, idempotent, description, JSON input schema). Regenerated
  and drift-guarded by `apps/server/src/routes/agent/mcp-tools.test.ts`.
- `mcp-smoke.evidence.json` — machine-checked local run of the read-only and
  draft-only paths (see below).
- `codex-setup.md` / `codex-config.example.toml` — Codex client config + smokes.
- `claude-setup.md` / `claude-config.example.json` — Claude client config + smokes.

All configs use environment-style placeholders (`${ZERO_MCP_HOST}`) and never a real
token.

## What was executed (local, deterministic)

`mcp-smoke.evidence.json` is produced by the test suite in Node with injected driver
fakes — no network, no OAuth-console, no production data. It exercises the actual
handler code from `mcp-tools.ts`:

- **Read-only**: `getServerCapabilities` (reports `canSendMail:false`), `listThreads`
  compact projection (metadata only, no bodies), `getOutboxItem` inspect.
- **Draft-only + idempotency**: `createDraft` called twice with the same
  `idempotencyKey` → **one** logical Gmail draft (`distinctGmailDraftsCreated: 1`),
  `sendCallsObserved: 0`.

The evidence asserts `oneLogicalDraftPerKey`, `zeroSends`, and `draftOnlyGuaranteed`.
Regenerate with:

```bash
cd apps/server && UPDATE_MCP_SNAPSHOTS=1 pnpm test src/routes/agent/mcp-tools.test.ts
```

Without the flag, `pnpm test` re-derives both artifacts and fails on any drift.

## Live end-to-end against local/staging — BLOCKER (documented, not worked around)

A fully live run (real Claude/Codex client → `/mcp` over HTTP) additionally requires an
**interactive better-auth OIDC login** (`codex mcp login zero`, or Claude `/mcp →
Authenticate`). The `/mcp` mount rejects any request without a valid `getMcpSession`
(`routes/index.ts`). No interactive OIDC session, OAuth-console access, or production
credential is available in this sandbox, and the task hard-stops forbid creating one.

Consequently the live-session portion is **documented, not executed** here (same
precedent as prior waves #28/#40). To complete it on a workstation once a login is
available:

### Codex

1. `codex mcp login zero`
2. Read-only: `codex exec "connecte-toi à Zero MCP, appelle getServerCapabilities et listThreads inbox (5) — ne crée rien"`
3. Draft-only: `codex exec "prépare 2 réponses sur compta@ via Zero MCP, createDraft ou enqueueDraftJob, n'envoie rien"`

### Claude Code / Desktop

1. `claude mcp add --transport http zero "https://${ZERO_MCP_HOST}/mcp"` then `/mcp → Authenticate`
2. Read-only: "call getServerCapabilities and listThreads inbox (5); create nothing"
3. Draft-only: "prepare 2 replies on compta@: createDraft or enqueueDraftJob; send nothing"

### Expected in both

- Discovery/list-tools returns the surface in `mcp-schema.snapshot.json`.
- `getServerCapabilities.canSendMail === false`.
- Drafts/outbox items created; **no new Sent message**; repeating with the same
  idempotency key yields the same id.

The structural guarantee holds regardless of the live run: the surface registers **no**
send / permanent-delete / spam / account-settings tool, asserted by
`scripts/security/check-agent-surface.mjs`.
