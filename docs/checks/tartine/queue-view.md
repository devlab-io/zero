# Frozen checks — tartine / queue-view (issue #4)

Executor: bash
Spec pointer: docs/spec/agent-draft-queue.md
Run: tartine · Slice: queue-view
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baseline recorded at freeze: `cd apps/mail && npx tsc --noEmit` yields 98
pre-existing `error TS` lines. The check enforces "no new errors".
i18n source of truth: `apps/mail/messages/<locale>.json` (inlang/paraglide).

## Runnable checks

- RUN: `ls "apps/mail/app/(routes)/queue"` -> expected: route directory exists (page + any nested files)
- RUN: `ls apps/mail/components/queue` -> expected: queue components directory exists
- RUN: `grep -rho "outbox" "apps/mail/app/(routes)/queue" apps/mail/components/queue | wc -l` -> expected output >= 1 (view consumes the #2 outbox tRPC router)
- RUN: `grep -c "queue" apps/mail/messages/en.json` -> expected output >= 1 (EN labels present)
- RUN: `grep -c "queue" apps/mail/messages/fr.json` -> expected output >= 1 (FR labels present)
- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 98 && echo TSC_NO_NEW_ERRORS` -> expected output `TSC_NO_NEW_ERRORS`
- RUN: `{ git diff --name-only base/tartine-wave2..HEAD -- apps/server; git status --porcelain -- apps/server; } | wc -l` -> expected output `0` (MUST NOT TOUCH: server untouched, committed or not; `base/tartine-wave2` is the tag the orchestrator sets on this job's worktree base commit at wave-2 dispatch — post-#2-merge)
- RUN: `{ git diff --name-only base/tartine-wave2..HEAD -- "apps/mail/app/(routes)/mail" "apps/mail/app/(routes)/settings"; git status --porcelain -- "apps/mail/app/(routes)/mail" "apps/mail/app/(routes)/settings"; } | wc -l` -> expected output `0` (other mail routes untouched)

## Judge-only checks

- List renders outbox items grouped/filterable by status
  (queued/generating/draft_ready/approved/sending/sent/cancelled/failed).
- One-touch actions approve / reject(cancel) / open exist and reuse the
  existing keyboard-action model (d/r/a/f/h pattern), not a new paradigm.
- Post-approve 15 s undo is wired to the `cancel` mutation (cancels the DO
  alarm path) and visibly counts down.
- Sidebar nav entry with pending-count badge is an isolated addition (no
  refactor of unrelated sidebar code).
- Only the published #2 interface contract is consumed; no server imports.
