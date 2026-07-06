# Frozen checks — tartine / outbox-core (issue #2)

Executor: bash
Spec pointer: docs/spec/agent-draft-queue.md
Run: tartine · Slice: outbox-core
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baseline recorded at freeze: `cd apps/server && npx tsc --noEmit` yields 81
pre-existing `error TS` lines (fork debt, incl. node_modules .ts packages).
The check below enforces "no new errors", not zero.

## Runnable checks

- RUN: `grep -c "draft_outbox" apps/server/src/db/schema.ts` -> expected output >= 1 (table defined in Drizzle schema)
- RUN: `grep -rl "draft_outbox" apps/server/src/db/migrations | wc -l` -> expected output >= 1 (generated migration references the table)
- RUN: `test -f apps/server/src/trpc/routes/outbox.ts && echo ROUTER_OK` -> expected output `ROUTER_OK`
- RUN: `grep -c "outbox" apps/server/src/trpc/index.ts` -> expected output >= 1 (router registered in appRouter)
- RUN: `ls apps/server/src/lib/draft-outbox/` -> expected: directory exists, lists state-machine source + tests
- RUN: `cd apps/server && npx vitest run src/lib/draft-outbox --reporter=basic 2>&1 | tail -15` -> expected: all tests pass, exit 0
- RUN: `test $(cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 81 && echo TSC_NO_NEW_ERRORS` -> expected output `TSC_NO_NEW_ERRORS`
- RUN: `{ git diff --name-only freeze/tartine..HEAD -- apps/mail apps/server/src/routes/agent/mcp.ts; git status --porcelain -- apps/mail apps/server/src/routes/agent/mcp.ts; } | wc -l` -> expected output `0` (MUST NOT TOUCH respected, committed or not; `freeze/tartine` is the freeze tag)

## Judge-only checks

- The state machine is implemented as pure functions testable outside the
  Durable Object (no DO/env import in the transition module).
- Vitest suite covers, by name or assertion, the four guard cases:
  double-approve rejected; cancel during countdown allowed from `approved`;
  retry allowed from `failed` only; idempotence — an item cannot be sent
  twice (gmail_draft_id + state guard).
- tRPC router `outbox` exposes `list`, `enqueue`, `approve`, `cancel`,
  `retry`, `get` with zod-validated inputs.
- Table columns match the spec: id, connection_id, thread_id?, mission?,
  status, gmail_draft_id?, subject, body, idempotency_key,
  scheduled_send_at?, error?, created_at, updated_at.
- DO alarm handler drives queued→generating→draft_ready and
  approved→(T+15s)→sending→sent; failure paths set `error` and `failed`.
- Interface contract block (router signatures, `DraftOutboxStatus` enum,
  `DraftOutboxItem` type) is published in the issue body for #3/#4 and
  matches the code.
