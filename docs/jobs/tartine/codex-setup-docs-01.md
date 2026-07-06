PHASE 0:

MIRROR: ORCHESTRATOR

Plan:
1. Verify the required base SHA and read the frozen check, the draft-queue spec, and the merged MCP route before editing.
2. Add documentation-only artifacts under `docs/agent/**`: setup guide plus versioned Codex config snippet.
3. Mirror the authoritative MCP surface from `apps/server/src/routes/agent/mcp.ts`, emphasizing `createDraft`, `enqueueDraftJob`, and the absence of any send tool.
4. Document the manual E2E flow from login through mission, draft/outbox verification, `/queue` approval/undo, and Gmail-side confirmation.
5. Run every frozen `RUN:` command verbatim in bash from the worktree root and record command, output, exit code, and executor here.

Disagreements:
- None found.

What I checked before finding none:
- `git rev-parse HEAD` returned `89488a9f2dad762a28537fc5ae2833b74d78c37e`, matching the required `base/tartine-wave3`.
- `docs/checks/tartine/codex-setup-docs.md` defines the seven frozen runnable checks and judge-only expectations for `mcp_servers.zero`, `/mcp`, draft-only warning, `codex mcp login zero`, a second file under `docs/agent/`, exact MCP tool surface, and manual E2E docs.
- `docs/spec/agent-draft-queue.md:8-11` states the agent prepares drafts and never sends; `:26-30` states `sendEmail` is removed and sending is human-only through Zero; `:34-39` defines `draft_ready`, approve countdown, mission, and draft-only MCP; `:53-57` assigns the Codex config docs and manual E2E to this slice.
- `apps/server/src/routes/agent/mcp.ts:65-595` registers the authoritative MCP surface: `getConnections`, `getThreadSummary`, `getActiveConnection`, `setActiveConnection`, `composeEmail`, `createDraft`, `enqueueDraftJob`, `listThreads`, `getThread`, `markThreadsRead`, `markThreadsUnread`, `modifyLabels`, `getCurrentDate`, `getUserLabels`, `getLabel`, and `createLabel`.
- Clarification, not a disagreement: the frozen judge text spotlights `createDraft` and `enqueueDraftJob`, while the route registers 16 tools total. The setup guide lists all 16 and separately highlights the deliberate absence of `sendEmail`, `sendDraft`, `drafts.send`, or any other send tool.
- `docs/runs/tartine/plan.md:160-161` contains the requested T3 caveat that the current better-auth MCP OIDC plugin is slated for deprecation in favor of the OAuth Provider Plugin.

What I built:
- Added `docs/agent/codex-setup.md` with a complete `~/.codex/config.toml` Zero MCP block, `/mcp` endpoint guidance, `codex mcp login zero`, and the better-auth/OAuth Provider Plugin caveat.
- Documented the draft-only boundary explicitly: no send tool is exposed; `createDraft` only creates Gmail drafts, and `enqueueDraftJob` only creates outbox items awaiting human review.
- Listed the exact registered MCP tools from the merged route.
- Added example `codex exec` mission prompts, including `prépare les réponses en attente de compta@`.
- Documented the manual E2E procedure: login, mission, verify drafts plus `draft_ready` outbox items and zero sends, use `/queue` to approve one item through the 15 second countdown to `sent`, cancel the other to `cancelled`, then confirm in Gmail.
- Added versioned config snippet `docs/agent/codex-config.example.toml`.

Check evidence:

COMMAND: `test -f docs/agent/codex-setup.md && echo DOC_OK`
EXECUTOR: bash
OUTPUT:
```text
DOC_OK
```
EXIT_CODE: 0

COMMAND: `grep -c "mcp_servers.zero" docs/agent/codex-setup.md`
EXECUTOR: bash
OUTPUT:
```text
1
```
EXIT_CODE: 0

COMMAND: `grep -c "/mcp" docs/agent/codex-setup.md`
EXECUTOR: bash
OUTPUT:
```text
4
```
EXIT_CODE: 0

COMMAND: `grep -ci "draft.only" docs/agent/codex-setup.md`
EXECUTOR: bash
OUTPUT:
```text
4
```
EXIT_CODE: 0

COMMAND: `grep -c "codex mcp login zero" docs/agent/codex-setup.md`
EXECUTOR: bash
OUTPUT:
```text
2
```
EXIT_CODE: 0

COMMAND: `ls docs/agent/ | wc -l`
EXECUTOR: bash
OUTPUT:
```text
       2
```
EXIT_CODE: 0

COMMAND: `{ git diff --name-only base/tartine-wave3..HEAD -- apps packages; git status --porcelain -- apps packages; } | wc -l`
EXECUTOR: bash
OUTPUT:
```text
       0
```
EXIT_CODE: 0

Sandbox limitations / substitutions:
- No network or tracker access was used. The issue body was mirrored from the prompt, and the implementation relied only on repository files in this worktree.
- `apps/**`, `packages/**`, and `docs/checks/**` were read-only for this slice; no code files or frozen check files were edited.
- The deployment hostname is represented as `https://<zero-deployment-host>/mcp` because no network/tracker lookup was permitted; the docs instruct replacing it with the actual deployed Zero origin.

STATUS: DONE — all frozen RUN checks pass locally
