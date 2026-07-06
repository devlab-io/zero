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
