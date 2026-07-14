# Job report — niveau9/ci-and-deploy-gates-01

MIRROR: ORCHESTRATOR

Issue: devlab-io/zero#17 — [niveau9] V0.2 ci-and-deploy-gates.
Worktree: `.architect/wt/niveau9/ci-and-deploy-gates-01`
(branch `job/niveau9/ci-and-deploy-gates-01`, HEAD `2afae71e`).
Check frozen at `docs/checks/niveau9/ci-deploy.md` (read-only, not touched).

---

## PHASE 0 — Plan, disagreements, and what I verified

### What I verified before concluding the spec is sound

- **Worktree identity**: `git rev-parse HEAD` = `2afae71e429f4144ec55c734814024109560ffd5`,
  branch `job/niveau9/ci-and-deploy-gates-01`. `docs/checks/niveau9/ci-deploy.md`
  and `scripts/security/check-agent-surface.mjs` both present. No divergence.
- **Base CI** (`.github/workflows/ci.yml`, workflow `quality-and-security`): already
  does frozen install (`--frozen-lockfile --ignore-scripts`), check-agent-surface,
  `pnpm audit --prod --audit-level critical`, oxlint (but `@latest`), build mail,
  server dry-run. Missing: wrangler types, typecheck, tests, gitleaks, ratchets,
  migrations check, mail dry-run, oxlint pin.
- **oxlint `@latest` survivors**: `.github/workflows/ci.yml:43` and
  `package.json:11` (`precommit` script). `.husky/pre-commit` is already
  `oxlint@1.9.0`. `precommit` script has **no external caller**
  (`grep` across yml/json/sh = none) → safe to remove per RULING R8.
- **Test harness** (from #16): `pnpm test` → turbo → **9 tests pass** (server 7, mail 2),
  exit 0, ~4s. Blocking test step is satisfiable today.
- **wrangler types sequence**: `pnpm --filter @zero/server types`
  (`wrangler types --env local`, 6s) + `pnpm --filter @zero/mail types`
  (`wrangler types`, 2s) both exit 0. Required before tsc.
- **tsc baseline** (report mode, after wrangler types): server **82** errors,
  mail **135** errors (≈ the "83+135" the spec anticipated) → confirms why
  typecheck is report-mode, not blocking.
- **Ratchet baselines**: measured with the FROZEN grading-rubric commands
  (A1/A2/A5) — table below.
- **Migration drift**: main DB (`apps/server/src/db/migrations`) has 3 orphan SQL
  files (`0025_far_echo`, `0029_thin_triathlon`, `0032_smiling_raider`) and
  duplicate numeric prefixes (0025, 0029, 0032, 0035); journal also carries
  duplicate idx/tag entries. Agent DB (`apps/server/src/routes/agent/db/drizzle`)
  is clean (1 migration). Matches the spec's "3 orphelins + préfixes dupliqués".
- **gitleaks**: CLI 8.30.1 available locally; `gitleaks dir .` = 1s, honours
  .gitignore (0 node_modules hits). On the bare tree it reports **8 findings, all
  false positives** in `i18n.lock` (generic-api-key rule hitting translation
  strings). With a pinned config allowlisting that generated file → **0 findings, exit 0**.

### Disagreements / deviations from the literal spec (flagged, with reasons)

1. **gitleaks: pinned CLI/Docker image, NOT `gitleaks/gitleaks-action`.**
   The check says "gitleaks action épinglée". Verified against the live
   dependency: **gitleaks-action@v2 requires a `GITLEAKS_LICENSE` secret for
   organization-owned repos**, and `github.com/devlab-io/zero` is org-owned
   (confirmed via `git remote`). The frozen check point 4 says "aucun secret
   nouveau requis" and I cannot provision that license. A SHA-pinned action that
   then hard-fails for lack of a secret would break the "green CI < 15 min"
   acceptance. I therefore run the **pinned, MIT-licensed gitleaks Docker image
   by version tag** (`ghcr.io/gitleaks/gitleaks:v8.30.1`) — the same scanner, no
   license gate, no new secret, deterministic, and actually executable. TOOL
   GUIDANCE explicitly anticipates this ("si un GITLEAKS_LICENSE s'avère
   requis... documente"). Config lives at `scripts/checks/gitleaks.toml`
   (within MAY-TOUCH), scope = working tree (`gitleaks dir`). Full git-history
   scan + triage of inherited fork findings is rubric A7's scope, not this gate.

2. **A 5th helper script — `scripts/checks/typecheck-report.mjs`.** The spec
   names 4 ratchet scripts (loc/type/console/migrations) but OBJECTIVE point 1
   *also* requires "typecheck en mode RAPPORT non bloquant + ratchet non
   croissant + un simple commutateur". The frozen A2 command that `type-ratchet`
   must use is the **static `any`-count grep**, not `tsc` — a different concern.
   Rather than overload `type-ratchet.mjs` with a slow `tsc` invocation, I keep
   `type-ratchet.mjs` = A2 `any` ratchet (faithful to the frozen A2 command) and
   implement the typecheck report + non-growing baseline + blocking switch in a
   dedicated `typecheck-report.mjs`. This is within the `scripts/checks/**`
   MAY-TOUCH authority; I flag it here so it is not a silent addition.

3. **`loc-ratchet` also enforces the A1 *frontier* command.** A1 has TWO frozen
   commands (LOC + the `(\.\./)+server/src` frontier grep). The frontier
   currently returns **5** results (not 0). Fixing those cross-app imports is
   modularity work = out of scope. So `loc-ratchet` freezes the frontier at a
   **non-growing borne ≤5** (measured), rather than the palier-7 target of 0.
   Flagged so a cold judge does not read a passing `loc-ratchet` as "frontier = 0".

4. **Ratchet bornes are the MEASURED baseline, far above the rubric's palier-9
   targets — by design.** e.g. console server = 462 (target ≤20), any total = 170
   (target ≤40). Per the spec, bornes = values measured now; these ratchets
   prevent **regression only**, they do NOT enforce palier-9. The reductions are
   other issues (#20/#21 for types, A5 work for console). Stated explicitly so a
   green ratchet is not mistaken for meeting the final type/console targets.

5. **oxlint pin = 1.9.0 everywhere** (matching `.husky/pre-commit`), not a bump.
   Rationale (spec gives the choice): a version bump could surface new rules as
   errors on the security-critical files and turn the lint step red; 1.9.0 is the
   version the hook already validates against. Documented choice.

6. **lint-staged is invoked via `pnpm dlx`, not added as a dependency.**
   lint-staged is not in the repo deps and `pnpm-lock.yaml` is MUST-NOT-TOUCH, so
   I cannot add it. The hook runs `pnpm dlx lint-staged@17.0.8` (pinned) and the
   lint-staged config runs `pnpm dlx oxlint@1.9.0` on staged files. dlx fetches
   are cached after first use; hooks run on dev machines with network and are not
   run in CI. Same reasoning as the existing `.husky/pre-commit` which already
   used `pnpm dlx oxlint@1.9.0`.

7. **Minor: local dry-run `--outdir` points at `.architect/tmp/...`** (sandbox
   policy) while the committed yaml keeps `/tmp/...` (ephemeral GH-runner path,
   the convention). Only the outdir path differs; behaviour/timing are unaffected.

No other disagreements. Everything else in the spec is implementable as written
and the acceptance commands are reproducible.

---
## RESULTS (raw)

### Files delivered

| File | Action |
|---|---|
| `.github/workflows/ci.yml` | rewritten — full blocking CI (18 steps) |
| `.github/workflows/deploy-to-prod-command.yml` | deploy gate + `actions: read` |
| `.husky/pre-commit` | → `pnpm dlx lint-staged@17.0.8` |
| `package.json` | removed `precommit` (`@latest`), removed dead `scripts.lint-staged`, added `lint-staged` config |
| `scripts/checks/loc-ratchet.mjs` | new (A1 LOC + frontier) |
| `scripts/checks/type-ratchet.mjs` | new (A2 `any`) |
| `scripts/checks/console-ratchet.mjs` | new (A5 `console.*`) |
| `scripts/checks/migrations-consistency.mjs` | new (A6) |
| `scripts/checks/migrations-allowlist.json` | new (pre-filled with current drift) |
| `scripts/checks/typecheck-report.mjs` | new (typecheck report + switch) |
| `scripts/checks/gitleaks.toml` | new (pinned scan config) |
| `docs/testing.md` | added CI section |

`.oxlintrc.json` left unchanged — the oxlint *version* is pinned in the invoking
commands (not in this config), and no scoping change was required.

### Ratchet baselines — MEASURED with the frozen grading-rubric commands (2026-07-12)

| Metric (frozen command) | Measured | Ratchet borne | Palier-9 target (other issues) |
|---|---|---|---|
| A1 files > 1200 LOC | 9 | per-file budgets | — |
| A1 files > 800 LOC | 17 | 17 budgeted (each ≤ measured LOC) | ≤6 |
| A1 largest file | `apps/server/src/routes/agent/index.ts` = 2274 | ≤2274 | — |
| A1 cross-app frontier imports | 5 | ≤5 (non-growing) | 0 |
| A2 `any` — mail | 79 | ≤79 | ≤25 |
| A2 `any` — server | 91 | ≤91 | ≤15 |
| A2 `any` — total | 170 | ≤170 | ≤40 |
| A5 `console.*` — server | 462 | ≤462 | ≤20 |
| A5 `console.*` — front | 143 | ≤143 | ≤40 |
| tsc errors — server (report) | 82 | baseline 82 (non-growing) | 0 |
| tsc errors — mail (report) | 135 | baseline 135 (non-growing) | 0 |

Ratchets are NON-GROWING at the measured baseline; they prevent regression only.
Reductions toward palier-9 are #20/#21 (types) and A5 work (console) — not this job.

### CI step → duration → exit (local sequential replay, RULING pré-accordé)

Each workflow step run locally, in order, same commands (dry-run `--outdir` pointed
at `.architect/tmp` per sandbox policy; the only difference from the yaml).

| Step | Duration | Exit |
|---|---|---|
| 01 install `--frozen-lockfile --ignore-scripts` | 1s (warm store) | 0 |
| 02 wrangler types (server + mail) | 4s | 0 |
| 03 typecheck-report (tsc ×2, report mode) | 22s | 0 |
| 04 `pnpm test` (blocking, 9 tests) | 2s | 0 |
| 05 oxlint@1.9.0 security-critical files | 1s | 0 |
| 06 loc-ratchet | 0s | 0 |
| 07 type-ratchet | 0s | 0 |
| 08 console-ratchet | 0s | 0 |
| 09 migrations-consistency | 0s | 0 |
| 10 `pnpm audit --prod --audit-level critical` | 4s | 0 |
| 11 check-agent-surface | 0s | 0 |
| 12 gitleaks (dir + pinned config) | 1s | 0 |
| 13 build mail | 26s | 0 |
| 14 dry-run server (`--env local`) | 3s | 0 |
| 15 dry-run mail | 1s | 0 |
| **TOTAL** | **65s** (warm store) | all 0 |

Cold-cache install on the GH runner adds ~2–4 min; total stays well under the
15-minute budget. Real CI proof lands on the PR run.

### Ratchet script behaviour (verbatim, green run)

```
loc-ratchet: files > 800 LOC = 17 (budget entries 17)
loc-ratchet: cross-app frontier imports = 5 (max 5)
loc-ratchet PASSED (no regression).

type-ratchet: any(mail)=79/79  any(server)=91/91  any(total)=170/170
type-ratchet PASSED (no regression).

console-ratchet: console(server)=462/462  console(front)=143/143
console-ratchet PASSED (no regression).

migrations-consistency [apps/server/src/db/migrations]: 42 sql, 39 journalled, 3 orphan(s), 0 missing, 4 duplicate-prefix group(s)
migrations-consistency [apps/server/src/routes/agent/db/drizzle]: 1 sql, 1 journalled, 0 orphan(s), 0 missing, 0 duplicate-prefix group(s)
migrations-consistency PASSED (drift within documented allowlist).

typecheck-report [mode=report]
  server: 82 errors (baseline 82)
  mail:   135 errors (baseline 135)
typecheck-report OK — no regression above baseline.
```

### Negative tests — the gates FAIL loudly (not success-shaped no-ops)

**migrations-consistency with an EMPTY allowlist** (restored immediately):
```
migrations-consistency FAILED (7):
  - [apps/server/src/db/migrations] orphan SQL not journalled: 0025_far_echo.sql
  - [apps/server/src/db/migrations] orphan SQL not journalled: 0029_thin_triathlon.sql
  - [apps/server/src/db/migrations] orphan SQL not journalled: 0032_smiling_raider.sql
  - [apps/server/src/db/migrations] duplicate prefix 0025: 0025_far_echo, 0025_nervous_paper_doll
  - [apps/server/src/db/migrations] duplicate prefix 0029: 0029_common_network, 0029_thin_triathlon
  - [apps/server/src/db/migrations] duplicate prefix 0032: 0032_add_image_compression_setting, 0032_smiling_raider
  - [apps/server/src/db/migrations] duplicate prefix 0035: 0035_giant_hydra, 0035_uneven_shiva
exit=1
```

**type-ratchet with server budget tightened 91→90** (restored immediately):
```
type-ratchet: any(mail)=79/79  any(server)=91/90
type-ratchet FAILED (1):
  - any in server = 91 > budget 90
exit=1
```

### Pre-commit hook — lint-staged proof (2 test commits in this worktree)

husky was wired locally (`git config core.hooksPath .husky/_`); both commits were
undone; HEAD is back at pristine `2afae71e`; the local `core.hooksPath` was unset
and the generated (gitignored) `.husky/_` removed afterward.

**Clean commit — PASSES** (`scratch-clean.ts` staged):
```
[SKIPPED] *.{js,jsx,...} — no files
[STARTED]  pnpm dlx oxlint@1.9.0 --deny-warnings
[COMPLETED] pnpm dlx oxlint@1.9.0 --deny-warnings
[STARTED]  prettier --write
[COMPLETED] prettier --write
[COMPLETED] *.{ts,tsx} — 1 file
[job/niveau9/ci-and-deploy-gates-01 477b694b] test(hook): clean staged file — should pass
commit exit=0
```
→ then `git reset --soft HEAD~1`.

**Dirty commit — BLOCKS** (`scratch-dirty.ts` with `alert('nope')` staged):
```
[FAILED] pnpm dlx oxlint@1.9.0 --deny-warnings [FAILED]
✖ eslint(no-alert): `alert`, `confirm` and `prompt` functions are not allowed
   2 |   alert('nope')
Found 0 warnings and 1 error.
husky - pre-commit script failed (code 1)
commit exit=1   (HEAD unchanged: 2afae71e)
```

Staged-only scope confirmed: lint-staged ran only on the staged file, so the
repo's pre-existing warnings do not fail the hook.

### Frozen check §RUN (mechanical — re-run verbatim)

```
node scripts/security/check-agent-surface.mjs
  → Security surface check passed: least scopes, bounded session cache, draft-only MCP.  (exit 0)
grep -c "frozen-lockfile" .github/workflows/ci.yml            → 1   (≥1 ✓)
grep -rn "oxlint@latest" .github/workflows/ .husky/ package.json | wc -l   → 0  (✓)
```

### Deploy gate (workflow content — AUCUN deploy exécuté)

`deploy-to-prod-command.yml` now runs, before any mutation, a step that fetches
`origin/staging`, resolves its SHA, and queries the `quality-and-security` run for
that SHA via `gh api`; if the latest completed conclusion is not `success`, it
`exit 1` (hard stop) and never reaches the rebase / `git push --force-with-lease`.
Only trusted contexts (`github.repository`) are interpolated; the SHA is computed
in-shell — no untrusted event data reaches the shell.

### gitleaks decision (recap)

- gitleaks-action@v2 **requires `GITLEAKS_LICENSE` for org-owned repos** (verified;
  `github.com/devlab-io/zero` is org-owned) — conflicts with "aucun secret nouveau
  requis". Pinned CLI/Docker image `ghcr.io/gitleaks/gitleaks:v8.30.1` used instead
  (same MIT scanner, no license gate). Image tag existence verified.
- On the bare tree gitleaks reports 8 findings, all `generic-api-key` false
  positives inside the generated `i18n.lock`. `scripts/checks/gitleaks.toml`
  allowlists that single path → 0 findings, exit 0.

MIRROR: ORCHESTRATOR

### Concerns (non-blocking)

1. Real GitHub-Actions CI duration/green is provable only on the PR run (worktree
   cannot push) — RULING pré-accordé covers this; local sequential timing = 65s.
2. Typecheck is in **report mode** (server 82 / mail 135 known errors). The
   `TYPECHECK_BLOCKING` switch is in place for the orchestrator to flip at end of
   wave 1; flipping it now would make CI red (that debt is #20/#21).
3. `pnpm dlx` (hook: lint-staged, oxlint) fetches pinned versions from the registry
   on first use (cached after). Hooks run on dev machines with network and are not
   used in CI; this mirrors the pre-existing `.husky/pre-commit`.
4. gitleaks CLI/Docker deviates from the check's literal "action" wording — see
   disagreement #1; justified by the org-license reality + the no-new-secret rule.

STATUS: COMPLETE_WITH_CONCERNS (report-mode typecheck by design; gitleaks via pinned CLI/Docker not the org-licensed action; real GH-Actions CI green provable only on the PR run — all per rulings/spec)
