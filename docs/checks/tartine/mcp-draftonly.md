# Frozen checks — tartine / mcp-draftonly (issue #3)

Executor: bash
Spec pointer: docs/spec/agent-draft-queue.md
Run: tartine · Slice: mcp-draftonly
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baseline recorded at freeze: server tsc baseline = 81 `error TS` lines
(5 of them pre-existing in `apps/server/src/routes/agent/mcp.ts` — fixing
them is welcome, adding to them is not). `sendEmail` is registered at
mcp.ts line ~238 at freeze.

## Runnable checks

- RUN: `grep -c "sendEmail" apps/server/src/routes/agent/mcp.ts; true` -> expected output `0` (send tool fully removed, no dead references)
- RUN: `grep -c "createDraft" apps/server/src/routes/agent/mcp.ts` -> expected output >= 1
- RUN: `grep -c "enqueueDraftJob" apps/server/src/routes/agent/mcp.ts` -> expected output >= 1
- RUN: `ls apps/server/src/lib/mail-sanitize/` -> expected: directory exists with sanitizer source + tests
- RUN: `cd apps/server && npx vitest run src/lib/mail-sanitize --reporter=basic 2>&1 | tail -15` -> expected: all tests pass, exit 0
- RUN: `test $(cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 81 && echo TSC_NO_NEW_ERRORS` -> expected output `TSC_NO_NEW_ERRORS`
- RUN: `{ git diff --name-only base/tartine-wave2..HEAD -- apps/mail apps/server/src/db apps/server/src/trpc; git status --porcelain -- apps/mail apps/server/src/db apps/server/src/trpc; } | wc -l` -> expected output `0` (MUST NOT TOUCH respected, committed or not: outbox/#2 surfaces and mail app untouched; `base/tartine-wave2` is the tag the orchestrator sets on this job's worktree base commit at wave-2 dispatch — post-#2-merge)

## Judge-only checks

- `createDraft` uses the Gmail driver drafts.create path with optional
  `threadId` for in-thread replies; it never sends.
- `enqueueDraftJob` writes to the #2 outbox through its published interface
  contract (router or direct lib call per contract), status `queued`.
- No other MCP tool retains a send capability (audit every registerTool
  block: no drafts.send, no messages.send, no raw Gmail send scope use).
- Sanitizer covers: HTML→text, hidden-text neutralization (display:none,
  white-on-white, font-size 0/0pt), and untrusted-source marking
  (light spotlighting) applied to mail content served to the agent.
- Vitest includes at least one hidden-text case asserting neutralization.
