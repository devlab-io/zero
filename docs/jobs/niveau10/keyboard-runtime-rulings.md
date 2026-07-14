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

## 2026-07-14 — Sandboxed Paraglide fetch versus deterministic runner

- The fresh builder passed 35/35 focused tests, focused lint, the corrected touch-set audit, and diff hygiene, but its sandbox could not fetch the two jsDelivr Paraglide plugins; type generation then produced incomplete message exports and React Router prerender failed.
- The orchestrator's deterministic check-runner reran the exact frozen `react-router typegen && build` command outside the network-restricted builder sandbox. Plugin compilation and the full production build exited 0, while every other frozen command also exited 0.
- The authoritative independent evidence is `docs/jobs/niveau10/keyboard-runtime-checkrun.md`; no product fallback or check weakening is authorised.
