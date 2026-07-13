# Testing

The monorepo has two test layers: **unit** (vitest, per app, run via turbo) and
**e2e** (Playwright, in `@zero/testing`).

## Prerequisites

```bash
pnpm install
```

Unit tests do **not** require wrangler-generated types or a running app. The
current suites (`draft-outbox` state machine, `mail-sanitize`, queue view model)
are pure logic / pure-JS HTML parsing, so no `wrangler types` step is needed.

## Unit tests (vitest)

Run every app's unit tests through turbo from the repo root:

```bash
pnpm test          # turbo run test  → @zero/server + @zero/mail vitest run
```

- `apps/server` — `environment: node`, matches `src/**/*.test.ts`.
- `apps/mail` — `environment: happy-dom`, matches `{app,components,lib,hooks,store}/**/*.test.{ts,tsx}`.

Run a single app directly (watch mode, filtering, etc.):

```bash
pnpm --filter=@zero/server test          # vitest run (server only)
pnpm --filter=@zero/mail test            # vitest run (mail only)
pnpm --filter=@zero/server exec vitest   # watch mode for one app
pnpm --filter=@zero/server exec vitest run path/to/file.test.ts   # single file
```

The turbo `test` task is not cached (`"cache": false`): tests re-run every
invocation, so a green result always reflects the current code.

## E2E tests (Playwright, `@zero/testing`)

E2E lives in `packages/testing` and is **run locally, not in CI** for this wave.

```bash
# one-time: install Playwright browsers
pnpm --filter=@zero/testing exec playwright install

# start the app the specs drive (default baseURL http://localhost:3000)
pnpm --filter=@zero/mail start           # or: pnpm dev

# in another shell, run the e2e suite
pnpm test:e2e                            # → pnpm --filter=@zero/testing test:e2e
```

Other e2e entry points (from `@zero/testing`):

```bash
pnpm --filter=@zero/testing test:e2e:ui       # Playwright UI mode
pnpm --filter=@zero/testing test:e2e:debug    # step debugger
pnpm --filter=@zero/testing test:e2e:headed   # headed browser
```

E2E config: `packages/testing/playwright.config.ts` (reads `../../.env`, base URL
from `PLAYWRIGHT_BASE_URL`, auth via `e2e/auth.setup.ts`). Set `CI=1` to enable
retries and `forbidOnly`.

## CI (`quality-and-security` workflow)

`.github/workflows/ci.yml` runs on every PR and on pushes to `staging`
(`permissions: contents: read`). Steps, in order:

1. **Install** — `pnpm install --frozen-lockfile --ignore-scripts`.
2. **Generate Cloudflare Worker types** — `pnpm --filter @zero/server types`
   (`wrangler types --env local`) + `pnpm --filter @zero/mail types`. Must run
   before typecheck: `worker-configuration.d.ts` is what `tsc` resolves bindings
   against.
3. **Typecheck** — `node scripts/checks/typecheck-report.mjs`. Runs `tsc --noEmit`
   for both apps in **report mode** (never fails the build) and compares the
   error count to a frozen baseline (server 82, mail 135 at niveau9). The
   workflow env `TYPECHECK_BLOCKING` is the switch: flip it to `"true"` to make a
   regression above baseline a hard gate (orchestrator decision, end of wave 1).
4. **Tests (blocking)** — `pnpm test` (turbo → server + mail vitest).
5. **Lint security-critical files** — `oxlint@1.9.0` (pinned to the same version
   as `.husky/pre-commit`; no `@latest` anywhere).
6. **Ratchets (non-growing, blocking)** — `loc-ratchet` (A1 LOC per-file budgets +
   cross-app frontier ≤5), `type-ratchet` (A2 `any`: mail ≤79, server ≤91),
   `console-ratchet` (A5 `console.*`: server ≤462, front ≤143). Each runs the
   FROZEN grading-rubric command verbatim so counts match the cold judge. Bornes
   are the niveau9 baseline; they prevent regression only — the palier-9 targets
   are reached by later issues lowering these numbers.
7. **Migrations consistency** — `migrations-consistency.mjs`: fails on orphan SQL,
   journal entries without a file, or duplicate numeric prefixes, except items
   documented in `scripts/checks/migrations-allowlist.json` (pre-filled with the
   current drift; issue #19 empties it after repair).
8. **Audit** — `pnpm audit --prod --audit-level critical`.
9. **Agent/OAuth surface** — `node scripts/security/check-agent-surface.mjs`.
10. **Secret scan** — pinned `ghcr.io/gitleaks/gitleaks:v8.30.1` (`dir` mode,
    config `scripts/checks/gitleaks.toml`). The gitleaks GitHub Action is not used
    because it requires a `GITLEAKS_LICENSE` secret for org-owned repos and the
    acceptance forbids new secrets; the pinned CLI image is the same MIT scanner
    with no license gate.
11. **Build mail** — `pnpm --filter @zero/mail build`.
12. **Dry-run bundles** — `wrangler deploy --dry-run` for **both** server
    (`--env local`) and mail (no worker deploy; validates the bundle).

### Ratchet scripts (`scripts/checks/`)

Each ratchet re-runs the exact frozen counting command and exits non-zero with
context when a budget is exceeded. Run them locally the same way CI does:

```bash
node scripts/checks/loc-ratchet.mjs
node scripts/checks/type-ratchet.mjs
node scripts/checks/console-ratchet.mjs
node scripts/checks/migrations-consistency.mjs
node scripts/checks/typecheck-report.mjs            # report mode
TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs   # blocking mode
```

### Pre-commit hook (lint-staged)

`.husky/pre-commit` runs `pnpm dlx lint-staged@17.0.8`. The `lint-staged` config
in the root `package.json` runs `oxlint@1.9.0 --deny-warnings` then `prettier
--write` on **staged** `*.{ts,tsx}` files, and `prettier` on other staged file
types. Staged-only scope means the hook no longer fails on the repo's pre-existing
warnings — it only gates what you are committing.

### Deploy gate

`.github/workflows/deploy-to-prod-command.yml` (`/deploy` on a labelled PR) now
verifies, before rebasing and force-pushing `main`, that the `quality-and-security`
workflow concluded `success` on the staging SHA being shipped (via `gh api`). A
red or missing CI run hard-stops the deploy (`exit 1`); force-pushing an unverified
commit to production is impossible by construction.
