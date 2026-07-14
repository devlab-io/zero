# Search and triage rulings

## 2026-07-14 — Frozen check contradictions after builder 1

- Builder 1 passed 10/10 focused tests and diff hygiene, but the touch audit rejected `thread-triage.test.tsx` even though the frozen Vitest command requires that exact file. The allowlist now names it explicitly.
- The broad `components/context` ESLint target measured inherited errors in files outside the product delta. The corrected gate lints the clean changed subset, runs Prettier over the full authorised delta, and retains the blocking typecheck, focused tests, touch audit, and diff hygiene.
- The downstream typecheck also exposed the keyboard-owner `TS7017` recorded in `keyboard-runtime-rulings.md`; search may not edit that file and must consume the corrected keyboard freeze.
- `QuickSearchThread.from` is an obsolete projection type while live rows expose `sender`. A narrow exception permits only that interface field change in `command-registry.ts`; command definitions and keyboard bindings remain owned by `keyboard-runtime`.
- `/` must flow through the already certified `GlobalHotkeys` `search` action. A parallel native `keydown` listener is explicitly rejected.
- A fresh builder must start from the corrected freeze, rerun every corrected command, and produce a new report; the blocked implementation is not accepted by itself.

## 2026-07-14 — Search owns the remaining global mail type error

- After full Wrangler and Paraglide generation, the keyboard correction branch has no keyboard-owned TypeScript error; the only remaining mail error is the missing `idToUse` guard in `mail-list-thread.tsx:232`.
- Builder 1 already added the required early return in the search checkpoint. The fresh search builder must retain and test it, then prove the existing global blocking mail=0 command after consuming the corrected keyboard freeze.

## 2026-07-14 — Judge 1 FAIL: reset and real successor paths

- Independent judge 1 passed check integrity and all five frozen RUNs, including 33 focused tests and global `server=0` / `mail=0`, but found two product gaps hidden by helper-only tests.
- `clearAllFilters` cleared lexical text and the active-filter storage entry but not the independent label and category query states. Label-only empty results could therefore render the mailbox-empty state instead of no-results.
- The click path selected a successor before `optimisticMoveThreadsTo`, which then cleared `threadId`; the keyboard archive path removed the item before issuing `next`, causing the navigation hook to skip the row shifted into the removed index. The helper simulation did not exercise either integration path.
- Judge evidence is `docs/jobs/niveau10/search-triage-judge-1.md`. The authorised touch-set now includes only the concrete filter-state and navigation seams: `command-palette-context.tsx`, `mail.tsx`, `use-labels-search.ts`, `thread-display-hotkeys.tsx`, and `use-mail-navigation.ts`.
- The corrective builder must test reset against real query-state setters and test click plus keyboard archive/snooze on the actual integration helpers for 1/2/20 rows. It must prove successor URL/focus after the mutation and distinct mailbox-empty versus filtered-no-results behavior.
- Merge remains blocked until a fresh builder, fresh deterministic checkrun, and fresh independent judge all pass. Browser latency remains for final Computer Use verification even if the deterministic 20-event p75 test passes.
