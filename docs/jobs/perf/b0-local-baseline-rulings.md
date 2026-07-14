# Rulings — perf / b0-local-baseline (issue #8) · append-only, orchestrator-owned

## 2026-07-06 — BLOCKED answer: harness worktree cut from staging, not factory/perf

Builder BLOCKED correctly at FIRST-ACTION: harness auto-created its worktree
at e7ca6f4d (staging tip) instead of freeze/perf-b0 (64570dbd, factory/perf
tip) — spec and frozen checks absent at that HEAD. Known Claude-backend
worktree caveat (D11 family): the harness cuts agent worktrees itself; the
orchestrator cannot pre-create them.

RULING: builder is explicitly authorized to run, inside ITS OWN worktree only:
`git checkout --detach 64570dbdfa13146902450df946536094dbe43c78`
then re-verify HEAD and proceed with the unchanged plan. Same-session resume
(not respawn): live messaging is available and the builder context is young
(~46k tokens) — the skill's stated exception applies.
