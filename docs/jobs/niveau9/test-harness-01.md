# Job report — niveau9/test-harness-01 (issue devlab-io/zero#16, V0.1 test-harness)

MIRROR: ORCHESTRATOR

Worktree: `.architect/wt/niveau9/test-harness-01` — branch `job/niveau9/test-harness-01`
Frozen HEAD verified: `fc4a74c1414bdc39729ae73a8e79d257ff08b884`
Checks file present: `docs/checks/niveau9/tests.md`

---

## PHASE 0 — Plan and disagreements

### Verified against reality (real files in this worktree)
- 3 legacy tests: `apps/mail/components/queue/queue-view-model.test.ts` (2 `it`, pure logic, no DOM);
  `apps/server/src/lib/draft-outbox/state-machine.test.ts` (4 `it`, pure node);
  `apps/server/src/lib/mail-sanitize/index.test.ts` (3 `it`). **Total = 9 tests.**
- Sources under test: `queue-view-model.ts` pure TS; `state-machine.ts` pure state machine;
  `mail-sanitize/index.ts` imports `cheerio/slim` + `import type { Element } from 'domhandler'` →
  pure-JS HTML parser, **no browser DOM, no wrangler types**. Wrangler pitfall ruled out: none of
  the 3 tests reference `worker-configuration.d.ts` or a CF binding.
- `@zero/testing` = Playwright e2e package (real `test:e2e*` scripts + 5 specs + `playwright.config.ts`),
  plus vitest/testing-library/happy-dom/jsdom/coverage devDeps that were **never wired** (no vitest
  config, no `test` script).
- Root scripts `test/test:watch/test:coverage/test:ui` all point to **non-existent** `@zero/testing`
  scripts; `test:ai` and `eval:ci` to **non-existent** `@zero/server` scripts. `eval`/`eval:dev` exist.
  → `pnpm test` is **currently broken** (the problem this job fixes).
- No pre-existing vitest config. vitest 3.2.7 + happy-dom 20.10.6 already pinned (root overrides) and
  present in `pnpm-lock.yaml` → additive install stays green. `node_modules` absent → full `pnpm install`.

### Build plan (files inside BOUNDARIES only)
1. `apps/server/vitest.config.ts` (new) — `environment: 'node'`, `include: ['src/**/*.test.ts']`.
2. `apps/mail/vitest.config.ts` (new) — `environment: 'happy-dom'`,
   `include: ['{app,components,lib,hooks,store}/**/*.test.{ts,tsx}']`.
3. `apps/server/package.json` — add `"test": "vitest run"`.
4. `apps/mail/package.json` — add `"test": "vitest run"` + devDeps `vitest`/`happy-dom` (= override versions).
5. `turbo.json` — `test` task with `"cache": false` ("no cache on tests" — explicitly blessed by the check).
6. root `package.json` — `test` → `turbo run test`; delete 5 dead (`test:watch/coverage/ui/ai`, `eval:ci`);
   add `test:e2e` → `pnpm --filter=@zero/testing test:e2e`.
7. `docs/testing.md` — local unit + e2e sequences.

### Decisions (spec-granted latitude, documented, not silent)
- **`@zero/testing`: kept for e2e, NOT retired.** Retiring would delete 5 real e2e specs + auth setup +
  Playwright config — destructive, lost coverage. Its vitest/testing-library/coverage devDeps are left
  in place: they are exactly the toolkit the coverage wave (#35) and V5.2 front-end tests will consume;
  removing now = churn. `pnpm install` stays green with them.
- **Mail env = happy-dom.** The existing mail test needs no DOM (node would strictly suffice), but the
  spec frames "happy-dom ou jsdom côté mail", it is the correct env for a browser app, the version is
  already pinned, and it is the base for V5.2 front-end tests. Tension flagged: if `node` is preferred
  until a DOM test exists, that is a one-word ruling and I switch.

### Disagreements / risks raised (no silent compliance)
1. **V0.1/V5.2 scope collision in the frozen check.** The `RUN (mécanique)` line of
   `docs/checks/niveau9/tests.md` fuses V0.1 **and** V5.2: "≥120 tests passants (V5.2)". This job is V0.1
   only; coverage and the ≥120 count are V5.2 / issue #35, **explicitly out of scope** (BOUNDARIES +
   OUT OF SCOPE). My harness passes **9 tests** (the 3 files), not 120. A cold check-runner applying the
   combined RUN line as a gate on my slice will FAIL on the 120 counter even though **§V0.1 is fully
   satisfied**. → My slice must be judged against **§V0.1**, not the combined RUN line. Reaching 120
   requires writing new tests, which is forbidden to me (OUT OF SCOPE: "tout nouveau test").
2. **Delete vs repair of dead scripts.** I **delete** `test:coverage`/`test:ui`/`test:watch` (dead)
   rather than rewire them: correct rewiring needs `@vitest/coverage-v8`/`@vitest/ui` in each app, which
   belongs to #35 (coverage). If entry points should be kept now, that is a ruling to give.
3. **`pnpm-workspace.yaml` untouched** (though allowed): no catalog change needed; vitest/happy-dom flow
   through existing root overrides. Fewer files than the boundary permits — flagged for transparency.

---

## Decisions executed

| Decision | Outcome |
|---|---|
| `@zero/testing` | **Kept for e2e.** No edit to `packages/testing/**`. Its `test:e2e/test:e2e:ui/test:e2e:debug/test:e2e:headed` scripts verified present; surfaced at root via new `test:e2e`. Not retired (would delete 5 real specs + auth setup + Playwright config). Its vitest/testing-library/coverage devDeps retained for the coverage (#35) / V5.2 front-end waves. `pnpm install` green. |
| vitest env — server | `node` (`apps/server/vitest.config.ts`), `include: ['src/**/*.test.ts']`. Code under test is pure logic + cheerio/slim (pure-JS parser). |
| vitest env — mail | `happy-dom` (`apps/mail/vitest.config.ts`), `include: ['{app,components,lib,hooks,store}/**/*.test.{ts,tsx}']`. Existing test is pure logic (node would strictly suffice); happy-dom chosen per spec framing + as V5.2 front-end base. Confirmed loaded at runtime (`environment 184ms` in run output). |
| turbo `test` cache | `"cache": false` (the "no cache on tests" option blessed by the check). Verified: `0 cached, 2 total` on two consecutive runs. |
| deps added (apps/mail) | devDeps `vitest@3.2.7` + `happy-dom@20.10.6` (= root override pins; already in lockfile). |

## Commands executed (verbatim)

### `pnpm install` (worktree had no `node_modules`)
```
devDependencies:
+ @types/node 24.3.0 (26.1.1 is available)
+ @zero/tsconfig <- packages/tsconfig
+ dotenv-cli 10.0.0
+ husky 9.1.7
+ prettier 3.6.2
+ prettier-plugin-sort-imports 1.8.8
+ prettier-plugin-tailwindcss 0.6.14
+ tsx 4.20.5 (4.23.0 is available)
+ turbo 2.5.6
+ typescript 5.8.3 (7.0.2 is available)

Done in 20.7s using pnpm v10.15.0
```
Exit: 0 (green). Pre-existing unmet-peer warnings (unrelated to this job):
`date-fns@4.1.0` vs `resend` peer `^2||^3`; `agents@0.0.106` vs `hono-agents` peer `^0.0.93`;
`@testing-library/react@14.3.1` vs `react@19.1.0` peer `^18`. Ignored build script: `protobufjs`.
These predate this job (react 19 / testing-library 14 mismatch, etc.).

### `pnpm test` (root → `turbo run test`) — run 1
```
• Packages in scope: @zero/cli, @zero/eslint-config, @zero/mail, @zero/server, @zero/testing, @zero/tsconfig
• Running test in 6 packages
@zero/server:test: cache bypass, force executing edde559670826bd3
@zero/mail:test: cache bypass, force executing 7c444cce5d403022
@zero/server:test:  RUN  v3.2.7 .../apps/server
@zero/server:test:  ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 2ms
@zero/server:test:  ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 5ms
@zero/server:test:  Test Files  2 passed (2)
@zero/server:test:       Tests  7 passed (7)
@zero/server:test:    Duration  326ms (... environment 0ms ...)
@zero/mail:test:  RUN  v3.2.7 .../apps/mail
@zero/mail:test:  ✓ components/queue/queue-view-model.test.ts (2 tests) 1ms
@zero/mail:test:  Test Files  1 passed (1)
@zero/mail:test:       Tests  2 passed (2)
@zero/mail:test:    Duration  476ms (... environment 184ms ...)

 Tasks:    2 successful, 2 total
Cached:    0 cached, 2 total
  Time:    1.686s
```

### `pnpm test` — run 2 (determinism / cache:false)
```
=== pnpm test EXIT CODE: 0 ===
@zero/server:test:  ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 2ms
@zero/server:test:  ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 5ms
@zero/server:test:  Test Files  2 passed (2)
@zero/server:test:       Tests  7 passed (7)
@zero/mail:test:  ✓ components/queue/queue-view-model.test.ts (2 tests) 1ms
@zero/mail:test:  Test Files  1 passed (1)
@zero/mail:test:       Tests  2 passed (2)
 Tasks:    2 successful, 2 total
Cached:    0 cached, 2 total
```

### Test tally
| App | Env | Files | Tests |
|---|---|---|---|
| @zero/server | node | 2 (state-machine, mail-sanitize) | 7 |
| @zero/mail | happy-dom | 1 (queue-view-model) | 2 |
| **Total** | | **3** | **9** |

All 3 legacy files appear in output and pass. Exit 0 on both runs.

### `git status --short` (only in-boundary files)
```
 M apps/mail/package.json
 M apps/server/package.json
 M package.json
 M pnpm-lock.yaml
 M turbo.json
?? apps/mail/vitest.config.ts
?? apps/server/vitest.config.ts
?? docs/jobs/niveau9/test-harness-01.md
?? docs/testing.md
```
No MUST-NOT-TOUCH path modified (`.github/**`, `docs/checks/**`, `.husky/**`, app source, the 3
`*.test.ts` files). `pnpm-workspace.yaml` untouched. `packages/testing/**` untouched.

### `pnpm-lock.yaml` diff
Only the `apps/mail` importer gains `happy-dom: 20.10.6` + `vitest: 3.2.7`, plus a transitive
`debug: 4.4.1 → 4.4.3` patch refresh (6 lines; normal `pnpm install` lockfile refresh, not
`--frozen` since deps were added). No other lockfile change.

## Scripts inventory (repaired / removed)

**Root `package.json`:**
| Script | Before | After | Reason |
|---|---|---|---|
| `test` | `pnpm --filter=@zero/testing test` (BROKEN — no such script in @zero/testing) | `turbo run test` | repaired to run via turbo |
| `test:watch` | `pnpm --filter=@zero/testing test:watch` (dead) | **removed** | @zero/testing has no `test:watch`; watch belongs to #35 |
| `test:coverage` | `pnpm --filter=@zero/testing test:coverage` (dead) | **removed** | coverage = issue #35 (out of scope) |
| `test:ui` | `pnpm --filter=@zero/testing test:ui` (dead) | **removed** | UI runner = #35 |
| `test:ai` | `dotenv -- pnpm --filter=@zero/server run test:ai` (dead) | **removed** | @zero/server has no `test:ai` |
| `eval:ci` | `dotenv -- pnpm --filter=@zero/server run eval:ci` (dead) | **removed** | @zero/server has no `eval:ci` |
| `test:e2e` | — | `pnpm --filter=@zero/testing test:e2e` (added) | surfaces kept e2e package |
| `eval` | `dotenv -- pnpm --filter=@zero/server run eval` | unchanged (verified `eval` exists) | — |
| `eval:dev` | `dotenv -- pnpm --filter=@zero/server run eval:dev` | unchanged (verified exists) | — |

Post-change, every root script `--filter` reference resolves to an existing target
(`build`/`deploy`/`test:e2e`/`eval`/`eval:dev`). No monorepo `package.json` references a
non-existent script.

**`apps/server/package.json`:** added `"test": "vitest run"`.
**`apps/mail/package.json`:** added `"test": "vitest run"` + devDeps `happy-dom@20.10.6`, `vitest@3.2.7`.
**`turbo.json`:** added `"test": { "cache": false }`.

## Acceptance mapping (§V0.1)
1. `pnpm test` at root via turbo, exit 0, passes the 3 legacy files → **met** (9 tests, 3 files, 2 runs, exit 0).
2. `vitest.config.*` per app (server node / mail happy-dom) + `test` task in turbo.json → **met**.
3. Dead root scripts removed/repaired; no dangling script reference in any monorepo package.json → **met**.
4. `@zero/testing` decision executed (kept for e2e) + `pnpm install` green + `docs/testing.md` → **met**.

Note (see PHASE 0 risk #1): §V5.2 (≥120 tests, `vitest --coverage`) is issue #35 / out of scope and
NOT satisfied by this slice by design. This slice must be judged against §V0.1.


---

STATUS: COMPLETE_WITH_CONCERNS — (1) The frozen check `docs/checks/niveau9/tests.md` RUN line bundles V5.2 ("≥120 tests passants (V5.2)") with V0.1; this slice satisfies §V0.1 in full (9 tests, 3 legacy files, exit 0) but cannot reach ≥120 or coverage — those are issue #35 / OUT OF SCOPE and forbid me writing new tests. Judge this slice against §V0.1, not the combined RUN line. (2) Mail vitest env set to happy-dom (spec latitude); the sole existing mail test needs no DOM, so `node` would strictly suffice — one-word ruling flips it. (3) Dead scripts `test:coverage`/`test:ui`/`test:watch` were removed rather than rewired (correct rewiring needs coverage/ui deps = #35); say so if placeholders should remain.
