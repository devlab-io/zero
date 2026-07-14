# Checkrun: migrations-repair-01-checkrun
generated: 2026-07-13T09:05:40Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-migrations-repair-01.json
check_file: docs/checks/niveau9/data-config.md  freeze_sha: fc4a74c1414bdc39729ae73a8e79d257ff08b884
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=cd67ee0885bdccf103d6f4f3aa5af9aa124f585e
changed_files: 29 listed below; docs_checks_touched=false
.github/workflows/ci.yml
.github/workflows/deploy-to-prod-command.yml
.husky/pre-commit
apps/mail/package.json
apps/mail/vitest.config.ts
apps/server/package.json
apps/server/src/db/migrations/meta/_journal.json
apps/server/vitest.config.ts
docs/adr/0001-second-drizzle-config-durable-objects-sqlite.md
docs/jobs/niveau9/ci-and-deploy-gates-01-checkrun.md
docs/jobs/niveau9/ci-and-deploy-gates-01-rulings.md
docs/jobs/niveau9/ci-and-deploy-gates-01.md
docs/jobs/niveau9/migrations-repair-01-rulings.md
docs/jobs/niveau9/migrations-repair-01.md
docs/jobs/niveau9/test-harness-01-checkrun.md
docs/jobs/niveau9/test-harness-01-rulings.md
docs/jobs/niveau9/test-harness-01.md
docs/solutions/migrations-drift.md
docs/testing.md
package.json
pnpm-lock.yaml
scripts/checks/console-ratchet.mjs
scripts/checks/gitleaks.toml
scripts/checks/loc-ratchet.mjs
scripts/checks/migrations-allowlist.json
scripts/checks/migrations-consistency.mjs
scripts/checks/type-ratchet.mjs
scripts/checks/typecheck-report.mjs
turbo.json

## RUN (mécanique — check-runner) line 6
$ node scripts/checks/migrations-consistency.mjs
exit: 0  ms: 50  bytes: 337
migrations-consistency [apps/server/src/db/migrations]: 42 sql, 39 journalled, 3 orphan(s), 0 missing, 4 duplicate-prefix group(s)
migrations-consistency [apps/server/src/routes/agent/db/drizzle]: 1 sql, 1 journalled, 0 orphan(s), 0 missing, 0 duplicate-prefix group(s)
migrations-consistency PASSED (drift within documented allowlist).

## RUN (mécanique — check-runner) line 7
$ ls apps/server/src/db/migrations/*.sql | wc -l
exit: 0  ms: 14  bytes: 9
      42
