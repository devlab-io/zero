# Docs close 01

## PHASE 0 — plan, checks, disagreements

MIRROR: ORCHESTRATOR

Plan:

1. Verify the frozen base SHA before any other action.
2. Read the frozen docs-close checks and tartine plan.
3. Consume the three docs-debt items into `docs/solutions/`.
4. Document fork divergences and residual risk in `docs/FORK.md`.
5. Check README for obvious stale claims but leave it untouched.
6. Run every frozen `RUN:` command verbatim in bash and record output.

Checks performed:

- `git rev-parse HEAD` returned `2f759dd5b2c123deed1a3dc4dd32da2b7ac20421`.
- `docs/checks/tartine/docs-close.md` exists and was read.
- `docs/runs/tartine/plan.md` exists and was read.
- `docs/jobs/tartine/outbox-core-rulings.md` and `docs/jobs/tartine/queue-view-rulings.md` were read for the docs-debt details.
- `git log -n 1 --format=fuller 5e3888d0` and `git log -n 1 --format=fuller 005859de` were read for the fork-divergence descriptions.

Disagreements:

- None. The requested deliverables are docs-only and align with the frozen checks.

Scope notes:

- No files under `docs/checks/` were edited.
- No files under `apps/**` or `packages/**` were edited.
- No network/tracker access was used.
- No `git commit`, `git push`, or `git tag` command was run.

## Changes

- Added `docs/solutions/husky-oxlint-precommit.md`.
- Added `docs/solutions/worktree-wrangler-types.md`.
- Added `docs/solutions/mail-manual-route-registry.md`.
- Added `docs/FORK.md`.

## README check

Searched `README.md` together with docs for `sendEmail`, `MCP`, `draft.only`,
`draft-only`, `createDraft`, and `enqueueDraftJob`. No README hit contradicted
the tartine result, so README was not edited.

## Frozen RUN checks

Executor: bash

COMMAND: `ls docs/solutions/ | wc -l`

OUTPUT:

```text
       3
```

EXIT CODE: 0

COMMAND: `grep -rli "wrangler types\|worker-configuration" docs/solutions/ | wc -l`

OUTPUT:

```text
       1
```

EXIT CODE: 0

COMMAND: `grep -rli "husky\|oxlint" docs/solutions/ | wc -l`

OUTPUT:

```text
       1
```

EXIT CODE: 0

COMMAND: `grep -rli "routes.ts" docs/solutions/ | wc -l`

OUTPUT:

```text
       1
```

EXIT CODE: 0

COMMAND: `test -f docs/FORK.md && echo FORK_OK`

OUTPUT:

```text
FORK_OK
```

EXIT CODE: 0

COMMAND: `grep -ci "draft.only" docs/FORK.md`

OUTPUT:

```text
4
```

EXIT CODE: 0

COMMAND: `grep -ci "sendEmail" docs/FORK.md`

OUTPUT:

```text
2
```

EXIT CODE: 0

COMMAND: `{ git status --porcelain -- apps packages; } | wc -l`

OUTPUT:

```text
       0
```

EXIT CODE: 0

STATUS: DONE — all frozen RUN checks pass locally
