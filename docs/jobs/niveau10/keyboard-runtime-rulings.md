# Keyboard runtime rulings

## 2026-07-14 — Check repair after builder Phase 0

- The first builder run completed the scoped product implementation and passed 33/33 focused tests, lint with pre-existing warnings only, and `git diff --check`.
- The frozen build command was incomplete for a clean `--ignore-scripts` install: `react-router typegen` must run before the mail build so Paraglide and route artifacts exist. The orchestrator reproduced a successful build with that prerequisite.
- The frozen touch-set regular expression named the `lib/hotkeys/` and settings shortcut directories without a suffix wildcard, so it rejected their authorised contents. Directory alternatives now match descendants explicitly.
- These are check-contract corrections. They do not widen the product acceptance criteria or the MAY TOUCH boundary.
- A fresh builder must rerun every corrected frozen check and update `docs/jobs/niveau10/keyboard-runtime-01.md`; no implementation is accepted from the blocked report alone.

## 2026-07-14 — Untracked report path precision

- Plain `git status --porcelain` collapses a newly created untracked report directory to `docs/jobs/niveau10/`, causing the touch-set check to reject the authorised report before it is committed.
- The touch-set command now requests `--untracked-files=all`; the allowed product and report paths are unchanged.
