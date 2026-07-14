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

## 2026-07-14 — Judge 1 FAIL: AltGr and contextual help

- Independent judge 1 returned `Slice verdict: FAIL` even though every frozen RUN passed.
- `shortcutMatchesEvent` rejects a common AZERTY AltGr representation because browsers may expose AltGr as `Ctrl+Alt`; sequence dispatch also rejects any `ctrlKey`. The corrective test must include a produced punctuation event with `ctrlKey: true` and `altKey: true`, without allowing command/control chords to bypass scope rules.
- `Shift+?` currently navigates to `/settings/shortcuts`. The accepted spec requires an in-place contextual shortcut sheet without leaving the inbox; the fresh builder must implement that within the authorised hotkey/settings surface and add an observable test.
- Judge evidence is `docs/jobs/niveau10/keyboard-runtime-judge-1.md`. The orchestrator cannot merge until a fresh builder, fresh checkrun, and fresh independent judge all pass.

## 2026-07-14 — Judge 2 FAIL: contextual labels only partially localized

- Independent judge 2 verified both previous corrections: Ctrl+Alt AltGr punctuation is scope-safe, and `Shift+?` opens the contextual sheet in place while preserving the inbox route.
- The slice still failed because active `global` and `navigation` actions `goToStarred`, `goToSnoozed`, `toggleTheme`, and `toggleSidebar` fall back to raw internal identifiers in the contextual sheet.
- The corrective builder must provide explicit English and French catalog labels for every active contextual action and add a regression proving no active action falls back to its identifier.
- The MAY TOUCH boundary and frozen touch audit now include only `apps/mail/messages/en.json` and `apps/mail/messages/fr.json` in addition to the prior keyboard/settings surface. No other message catalog or product area is authorised.
- Merge remains blocked until a fresh builder, fresh checkrun under the new freeze, and fresh independent judge all pass.
