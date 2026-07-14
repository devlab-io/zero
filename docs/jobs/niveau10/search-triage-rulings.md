# Search and triage rulings

## 2026-07-14 — Frozen check contradictions after builder 1

- Builder 1 passed 10/10 focused tests and diff hygiene, but the touch audit rejected `thread-triage.test.tsx` even though the frozen Vitest command requires that exact file. The allowlist now names it explicitly.
- The broad `components/context` ESLint target measured inherited errors in files outside the product delta. The corrected gate lints the clean changed subset, runs Prettier over the full authorised delta, and retains the blocking typecheck, focused tests, touch audit, and diff hygiene.
- The downstream typecheck also exposed the keyboard-owner `TS7017` recorded in `keyboard-runtime-rulings.md`; search may not edit that file and must consume the corrected keyboard freeze.
- `QuickSearchThread.from` is an obsolete projection type while live rows expose `sender`. A narrow exception permits only that interface field change in `command-registry.ts`; command definitions and keyboard bindings remain owned by `keyboard-runtime`.
- `/` must flow through the already certified `GlobalHotkeys` `search` action. A parallel native `keydown` listener is explicitly rejected.
- A fresh builder must start from the corrected freeze, rerun every corrected command, and produce a new report; the blocked implementation is not accepted by itself.
