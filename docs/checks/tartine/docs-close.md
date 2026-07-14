# Frozen checks — tartine / docs-close (finish job)

Executor: bash
Spec pointer: docs/spec/agent-draft-queue.md
Run: tartine · Slice: docs-close (orchestrator-graded, no cold judge — human-ruled exception per skill)
Rule: any builder edit under docs/checks/ is an automatic FAIL.

## Runnable checks

- RUN: `ls docs/solutions/ | wc -l` -> expected output >= 3 (solutions entries for the run's diagnoses)
- RUN: `grep -rli "wrangler types\|worker-configuration" docs/solutions/ | wc -l` -> expected output >= 1 (env-trap solution documented)
- RUN: `grep -rli "husky\|oxlint" docs/solutions/ | wc -l` -> expected output >= 1 (pre-commit debt documented)
- RUN: `grep -rli "routes.ts" docs/solutions/ | wc -l` -> expected output >= 1 (manual route registry gotcha documented)
- RUN: `test -f docs/FORK.md && echo FORK_OK` -> expected output `FORK_OK`
- RUN: `grep -ci "draft.only" docs/FORK.md` -> expected output >= 1 (draft-only MCP divergence recorded)
- RUN: `grep -ci "sendEmail" docs/FORK.md` -> expected output >= 1 (residual in-app send-tool risk named)
- RUN: `{ git status --porcelain -- apps packages; } | wc -l` -> expected output `0` (docs-only job)

## Judge-only checks (orchestrator-graded)

- FORK.md accurately lists this fork's divergences vs Mail-0 upstream:
  telemetry stripped, self-host hardening/shortcuts, MCP draft-only surface
  (sendEmail removed; createDraft/enqueueDraftJob; sanitizer), draft outbox +
  /queue, and names the residual in-app chat send tool (Tools.SendEmail) as a
  known open risk with a pointer to the tracking-issue digest.
- Solutions entries are actionable (symptom → root cause → fix), not prose padding.
