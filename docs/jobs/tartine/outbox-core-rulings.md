# Rulings — tartine / outbox-core (issue #2) · append-only, orchestrator-owned

## 2026-07-05 — PHASE-0 ruling: DO alarm wiring surface

Builder PHASE 0 flagged an ambiguity: the MAY TOUCH list enumerates files then
allows "minimal DO wiring for the alarm handler" without naming the file. The
existing Durable Object owning the Gmail driver is
`apps/server/src/routes/agent/index.ts`.

RULING: approved — edits to `apps/server/src/routes/agent/index.ts` are within
the "minimal DO wiring" clause, limited strictly to the alarm/driver processing
surface required by the frozen checks (queued→generating→draft_ready and
approved→T+15s→sending→sent paths). `apps/server/src/routes/agent/mcp.ts`
remains MUST NOT TOUCH. The judge should read boundary compliance with this
amendment.

## 2026-07-05 — BLOCKED answer: tsc threshold was an environment defect, not a slice defect

Builder reported BLOCKED: frozen `<= 81 error TS` check counted 85 in its
sandbox, including at freeze SHA (proven via /tmp archive + symlinked deps).
Diagnosis (orchestrator): builder's offline install used `--ignore-scripts`,
skipping postinstall `nizzy sync` → `wrangler types` never generated
`worker-configuration.d.ts` (untracked ambient types) → +4 unrelated errors
(chat.ts +2, types.ts +1, agent/db/drizzle/migrations.js +1).

RESOLUTION: orchestrator ran `pnpm run types` in the worktree's apps/server;
tsc count = **81 exactly, slice code included**. The frozen check passes
verbatim in the repaired environment. No check amendment; no respawn — the
blocker required zero builder action and all other frozen RUN checks passed.

JUDGE ATTENTION: builder pruned unrelated generated SQL churn from the
drizzle-generated migration `0038_famous_malcolm_colcord.sql` (kept only the
outbox table/FK/indexes). Verify the migration body contains only draft_outbox
DDL and that the pruning did not desync `meta/0038_snapshot.json`/`_journal.json`.
