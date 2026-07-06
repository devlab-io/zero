PHASE 0:

Plan:
- Verify the freeze SHA and frozen inputs before any implementation work.
- Add failing Vitest coverage for the draft-outbox pure state-machine guards, then implement the pure transition module.
- Add the Drizzle `draft_outbox` table and generate or hand-write the corresponding migration under `apps/server/src/db/migrations/`.
- Add the `enqueueDraftJob` library helper, the private tRPC `outbox` router, and register it in `apps/server/src/trpc/index.ts`.
- Add minimal Durable Object alarm wiring to process queued items into Gmail drafts and approved items into sent mail after the 15 second cancellation window.
- Run every frozen `RUN:` command verbatim from this worktree root with bash, paste output and exit code here, and leave changes uncommitted.

Disagreements / spec check:
- Checked `docs/checks/tartine/outbox-core.md`: no disagreement with the runnable or judge-only checks. The checks explicitly allow the existing TypeScript baseline debt by requiring `error TS` count `<= 81`.
- Checked `docs/spec/agent-draft-queue.md`: no disagreement with the outbox lifecycle or the human-approval-only send rule. This slice will not touch MCP send tooling or mail UI.
- Checked the issue body: one ambiguity, not a blocker. The MAY TOUCH list enumerates specific files, then separately allows "minimal DO wiring for the alarm handler"; the existing Durable Object that owns the Gmail driver is `apps/server/src/routes/agent/index.ts`, so any edit there will be limited to the alarm/driver processing surface needed by the frozen checks.

MIRROR: ORCHESTRATOR

What I built:
- Added Drizzle table `draftOutbox` for `mail0_draft_outbox` and generated migration `0038_famous_malcolm_colcord` with journal/snapshot metadata. The generated SQL was pruned to the outbox table/FK/indexes only after Drizzle emitted unrelated pre-existing snapshot churn.
- Added pure draft-outbox state-machine functions and Vitest guard coverage for double-approve, cancel during countdown, retry from failed only, and idempotent double-send prevention.
- Added shared `apps/server/src/lib/draft-outbox/index.ts` helpers, including the exported `enqueueDraftJob(db, input)` path for MCP/other server consumers.
- Added private tRPC router `outbox` with `list`, `get`, `enqueue`, `approve`, `cancel`, and `retry`, and registered it in `appRouter`.
- Added minimal `ZeroDriver` Durable Object alarm wiring: queued jobs generate Gmail drafts and become `draft_ready`; approved jobs are armed for T+15s, move through `sending`, call `sendDraft`, and become `sent`; failures persist `error` and `failed`.

Check evidence:

COMMAND: `grep -c "draft_outbox" apps/server/src/db/schema.ts`
EXECUTOR: bash
OUTPUT:
```text
4
```
EXIT_CODE: 0

COMMAND: `grep -rl "draft_outbox" apps/server/src/db/migrations | wc -l`
EXECUTOR: bash
OUTPUT:
```text
       2
```
EXIT_CODE: 0

COMMAND: `test -f apps/server/src/trpc/routes/outbox.ts && echo ROUTER_OK`
EXECUTOR: bash
OUTPUT:
```text
ROUTER_OK
```
EXIT_CODE: 0

COMMAND: `grep -c "outbox" apps/server/src/trpc/index.ts`
EXECUTOR: bash
OUTPUT:
```text
2
```
EXIT_CODE: 0

COMMAND: `ls apps/server/src/lib/draft-outbox/`
EXECUTOR: bash
OUTPUT:
```text
index.ts
state-machine.test.ts
state-machine.ts
```
EXIT_CODE: 0

COMMAND: `cd apps/server && npx vitest run src/lib/draft-outbox --reporter=basic 2>&1 | tail -15`
EXECUTOR: bash
OUTPUT:
```text
        {
          "summary": false
        }
      ]
    ]
  }
}
 ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 3ms


 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  15:47:39
   Duration  184ms (transform 18ms, setup 0ms, collect 18ms, tests 3ms, environment 0ms, prepare 32ms)

```
EXIT_CODE: 0

COMMAND: `test $(cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 81 && echo TSC_NO_NEW_ERRORS`
EXECUTOR: bash
OUTPUT:
```text
```
EXIT_CODE: 1

COMMAND: `{ git diff --name-only freeze/tartine..HEAD -- apps/mail apps/server/src/routes/agent/mcp.ts; git status --porcelain -- apps/mail apps/server/src/routes/agent/mcp.ts; } | wc -l`
EXECUTOR: bash
OUTPUT:
```text
       0
```
EXIT_CODE: 0

Sandbox limitations / substitutions:
- Initial `npx vitest` attempts failed before `node_modules` existed because `npx` tried to reach `registry.npmjs.org` and network is unavailable. I then ran `pnpm install --offline --frozen-lockfile --ignore-scripts`, which succeeded from the local pnpm store without lifecycle scripts; the frozen Vitest command then passed.
- `drizzle-kit generate` ran locally and produced `apps/server/src/db/migrations/0038_famous_malcolm_colcord.sql` plus `meta/0038_snapshot.json` and `_journal.json`. I did not hand-write the migration, but I did prune unrelated generated SQL churn from the migration body.
- The TypeScript frozen threshold is the blocker: this sandbox counts 85 `error TS` lines, so the frozen `<= 81` command exits 1. To verify this was not introduced by this slice, I archived freeze SHA `3cb56cedaf8b46d15ec1009dc087b3008227a06e` into `/tmp/zero-freeze-baseline`, symlinked the same installed dependency tree, and ran `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` there; it also output `85`.
STATUS: BLOCKED — frozen TypeScript threshold command expects <=81 error TS lines but this sandbox reports 85 even at freeze SHA 3cb56cedaf8b46d15ec1009dc087b3008227a06e + implemented slice, installed deps offline, ran all frozen checks verbatim, and verified the threshold mismatch against a temporary freeze-SHA archive
