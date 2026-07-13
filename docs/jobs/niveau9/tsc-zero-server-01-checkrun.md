# Checkrun: tsc-zero-server-01-checkrun
generated: 2026-07-13T10:43:55Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-tsc-zero-server-01.json
check_file: docs/checks/niveau9/typecheck.md  freeze_sha: fc4a74c1414bdc39729ae73a8e79d257ff08b884
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=37c89408c4b85c61704abcd5dc43e22fa90c312f
changed_files: 61 listed below; docs_checks_touched=false
.github/workflows/ci.yml
.github/workflows/deploy-to-prod-command.yml
.husky/pre-commit
apps/mail/package.json
apps/mail/vitest.config.ts
apps/server/package.json
apps/server/src/env.ts
apps/server/src/lib/analyze/interests.ts
apps/server/src/lib/datadog-service.ts
apps/server/src/lib/driver/google.ts
apps/server/src/lib/driver/microsoft.ts
apps/server/src/lib/driver/utils.ts
apps/server/src/lib/gmail-rate-limit.ts
apps/server/src/lib/mail-sanitize/index.ts
apps/server/src/lib/server-utils.ts
apps/server/src/lib/trace-context.ts
apps/server/src/lib/trpc-logging.ts
apps/server/src/lib/utils.ts
apps/server/src/main.ts
apps/server/src/pipelines.effect.ts
apps/server/src/routes/agent/index.ts
apps/server/src/routes/agent/mcp.ts
apps/server/src/routes/agent/orchestrator.ts
apps/server/src/routes/agent/utils.ts
apps/server/src/routes/ai.ts
apps/server/src/routes/autumn.ts
apps/server/src/routes/chat.ts
apps/server/src/thread-workflow-utils/workflow-functions.ts
apps/server/src/thread-workflow-utils/workflow-utils.ts
apps/server/src/trpc/routes/settings.ts
apps/server/src/trpc/routes/shortcut.ts
apps/server/src/trpc/trpc.ts
apps/server/src/types/logging.ts
apps/server/src/vendor/dormroom.d.ts
apps/server/src/workflows/sync-threads-coordinator-workflow.ts
apps/server/src/workflows/sync-threads-workflow.ts
apps/server/tsconfig.json
apps/server/vitest.config.ts
docs/jobs/niveau9/ci-and-deploy-gates-01-checkrun.md
docs/jobs/niveau9/ci-and-deploy-gates-01-rulings.md
docs/jobs/niveau9/ci-and-deploy-gates-01.md
docs/jobs/niveau9/deps-catalog-01-rulings.md
docs/jobs/niveau9/deps-catalog-01.md
docs/jobs/niveau9/test-harness-01-checkrun.md
docs/jobs/niveau9/test-harness-01-rulings.md
docs/jobs/niveau9/test-harness-01.md
docs/jobs/niveau9/tsc-zero-server-01-rulings.md
docs/jobs/niveau9/tsc-zero-server-01.md
docs/testing.md
package.json
packages/eslint-config/package.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/checks/console-ratchet.mjs
scripts/checks/gitleaks.toml
scripts/checks/loc-ratchet.mjs
scripts/checks/migrations-allowlist.json
scripts/checks/migrations-consistency.mjs
scripts/checks/type-ratchet.mjs
scripts/checks/typecheck-report.mjs
turbo.json

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 6
$ pnpm --filter @zero/mail exec tsc --noEmit 2>&1 | tail -5
exit: 0  ms: 4341  bytes: 574
../../node_modules/.pnpm/transferable-object@0.0.22/node_modules/transferable-object/transferable-object.ts(186,13): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'string'.
../../node_modules/.pnpm/transferable-object@0.0.22/node_modules/transferable-object/transferable-object.ts(340,20): error TS2722: Cannot invoke an object which is possibly 'undefined'.
undefined
/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tsc-zero-server-01/apps/mail:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: tsc --noEmit

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 7
$ pnpm --filter @zero/server exec tsc --noEmit 2>&1 | tail -5
exit: 0  ms: 2853  bytes: 0

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 8
$ grep -rE ":\s*any\b|as any|<any>|\bany\[\]" apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src --include='*.ts' --include='*.tsx' --exclude='*.d.ts' --exclude='*.test.*' | wc -l
exit: 0  ms: 71  bytes: 9
      93

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 9
$ grep -rn "@ts-nocheck" apps/mail apps/server --include='*.ts' --include='*.tsx' --exclude='*.d.ts' | wc -l
exit: 0  ms: 37  bytes: 9
       1
