# Frozen checks — tartine / codex-setup-docs (issue #5)

Executor: bash
Spec pointer: docs/spec/agent-draft-queue.md
Run: tartine · Slice: codex-setup-docs
Rule: any builder edit under docs/checks/ is an automatic FAIL.

## Runnable checks

- RUN: `test -f docs/agent/codex-setup.md && echo DOC_OK` -> expected output `DOC_OK`
- RUN: `grep -c "mcp_servers.zero" docs/agent/codex-setup.md` -> expected output >= 1
- RUN: `grep -c "/mcp" docs/agent/codex-setup.md` -> expected output >= 1
- RUN: `grep -ci "draft.only" docs/agent/codex-setup.md` -> expected output >= 1 (draft-only warning present: no send tool exposed)
- RUN: `grep -c "codex mcp login zero" docs/agent/codex-setup.md` -> expected output >= 1 (OAuth better-auth login step)
- RUN: `ls docs/agent/ | wc -l` -> expected output >= 2 (versioned example config snippet ships alongside the doc)
- RUN: `{ git diff --name-only base/tartine-wave3..HEAD -- apps packages; git status --porcelain -- apps packages; } | wc -l` -> expected output `0` (MUST NOT TOUCH: zero code changes, committed or not; `base/tartine-wave3` is the tag the orchestrator sets on this job's worktree base commit at wave-3 dispatch — post-#3-merge)

## Judge-only checks

- Doc contains a full `~/.codex/config.toml` example with
  `[mcp_servers.zero]` and the `/mcp` URL for this deployment.
- At least one example mission prompt is included (e.g. « prépare les
  réponses en attente de compta@ »).
- The manual E2E test procedure from the plan is documented: login →
  mission → verify drafts + outbox `draft_ready` + zero sends → /queue
  approve (countdown → sent) and undo (→ cancelled) → Gmail-side check.
- The doc names the exact MCP tool surface shipped by issue #3
  (createDraft, enqueueDraftJob — and the absence of any send tool).
