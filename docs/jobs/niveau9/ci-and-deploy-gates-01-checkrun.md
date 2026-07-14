# Checkrun: ci-and-deploy-gates-01-checkrun
generated: 2026-07-13T08:34:36Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-ci-and-deploy-gates-01.json
check_file: docs/checks/niveau9/ci-deploy.md  freeze_sha: fc4a74c1414bdc39729ae73a8e79d257ff08b884
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=cac4d6c23e005c95d0e324c370831a0e016e88cc
changed_files: 23 listed below; docs_checks_touched=false
.github/workflows/ci.yml
.github/workflows/deploy-to-prod-command.yml
.husky/pre-commit
apps/mail/package.json
apps/mail/vitest.config.ts
apps/server/package.json
apps/server/vitest.config.ts
docs/jobs/niveau9/ci-and-deploy-gates-01-rulings.md
docs/jobs/niveau9/ci-and-deploy-gates-01.md
docs/jobs/niveau9/test-harness-01-checkrun.md
docs/jobs/niveau9/test-harness-01-rulings.md
docs/jobs/niveau9/test-harness-01.md
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
$ node scripts/security/check-agent-surface.mjs
exit: 0  ms: 34  bytes: 84
Security surface check passed: least scopes, bounded session cache, draft-only MCP.

## RUN (mécanique — check-runner) line 7
$ grep -c "frozen-lockfile" .github/workflows/ci.yml
exit: 0  ms: 9  bytes: 2
1

## RUN (mécanique — check-runner) line 8
$ grep -rn "oxlint@latest" .github/workflows/ .husky/ package.json | wc -l
exit: 0  ms: 11  bytes: 9
       0
