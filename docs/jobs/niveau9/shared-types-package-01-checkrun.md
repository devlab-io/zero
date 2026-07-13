# Checkrun: shared-types-package-01-checkrun
generated: 2026-07-13T14:05:27Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-shared-types-typecheck.json
check_file: docs/checks/niveau9/typecheck.md  freeze_sha: 85451f71
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=0f5548d767e64734106453459aa52b39bc485f55
changed_files: 78 listed below; docs_checks_touched=false
.gitignore
apps/mail/components/mail/mail-list.tsx
apps/mail/components/ui/ai-sidebar.tsx
apps/mail/components/ui/prompts-dialog.tsx
apps/mail/hooks/use-threads.ts
apps/mail/package.json
apps/server/.dev.vars.example
apps/server/package.json
apps/server/scripts/db-push-guard.mjs
apps/server/src/env-schema.test.ts
apps/server/src/env-schema.ts
apps/server/src/env.ts
apps/server/src/lib/analyze/interests.ts
apps/server/src/lib/auth-providers.ts
apps/server/src/lib/auth.ts
apps/server/src/lib/brain.fallback.prompts.ts
apps/server/src/lib/brain.ts
apps/server/src/lib/bulk-delete.ts
apps/server/src/lib/datadog-service.ts
apps/server/src/lib/driver/types.ts
apps/server/src/lib/email-utils.ts
apps/server/src/lib/email-verification.ts
apps/server/src/lib/errors.test.ts
apps/server/src/lib/errors.ts
apps/server/src/lib/factories/google-subscription.factory.ts
apps/server/src/lib/logger.ts
apps/server/src/lib/logging-service.ts
apps/server/src/lib/notes-manager.ts
apps/server/src/lib/sentry.test.ts
apps/server/src/lib/sentry.ts
apps/server/src/lib/sequential-thinking.ts
apps/server/src/lib/server-utils.ts
apps/server/src/lib/services.ts
apps/server/src/lib/timezones.ts
apps/server/src/lib/trace-context.ts
apps/server/src/lib/tracing.ts
apps/server/src/lib/trpc-logging.ts
apps/server/src/main.ts
apps/server/src/pipelines.effect.ts
apps/server/src/pipelines.ts
apps/server/src/routes/ai.ts
apps/server/src/routes/index.ts
apps/server/src/services/writing-style-service.ts
apps/server/src/thread-workflow-utils/index.ts
apps/server/src/thread-workflow-utils/workflow-engine.ts
apps/server/src/thread-workflow-utils/workflow-functions.ts
apps/server/src/thread-workflow-utils/workflow-utils.ts
apps/server/src/trpc/routes/bimi.ts
apps/server/src/trpc/routes/brain.ts
apps/server/src/trpc/routes/cookies.ts
apps/server/src/trpc/routes/mail.ts
apps/server/src/trpc/routes/meet.ts
apps/server/src/trpc/routes/notes.ts
apps/server/src/trpc/routes/settings.ts
apps/server/src/trpc/trpc.ts
apps/server/src/types.ts
apps/server/src/workflows/sync-threads-coordinator-workflow.ts
apps/server/src/workflows/sync-threads-workflow.ts
docs/adr/0003-tracing-strategy.md
docs/adr/0004-shared-types-package.md
docs/adr/0004-structured-logger.md
docs/adr/0005-server-sentry.md
docs/jobs/niveau9/server-runtime-guardrails-01-checkrun.md
docs/jobs/niveau9/server-runtime-guardrails-01-rulings.md
docs/jobs/niveau9/server-runtime-guardrails-01.md
docs/jobs/niveau9/shared-types-package-01-rulings.md
docs/jobs/niveau9/shared-types-package-01.md
packages/eslint-config/config.ts
packages/types/package.json
packages/types/src/driver.ts
packages/types/src/enums.ts
packages/types/src/fallback-prompts.ts
packages/types/src/index.ts
packages/types/src/message.ts
packages/types/tsconfig.json
pnpm-lock.yaml
scripts/checks/console-ratchet.mjs
scripts/checks/loc-ratchet.mjs

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 28
$ pnpm --filter @zero/mail exec tsc --noEmit 2>&1 | tail -5
exit: 0  ms: 13442  bytes: 434
../server/src/thread-workflow-utils/workflow-functions.ts(736,34): error TS2339: Property 'AI' does not exist on type 'Env'.
../server/src/thread-workflow-utils/workflow-functions.ts(753,34): error TS2339: Property 'AI' does not exist on type 'Env'.
undefined
/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/shared-types-package-01/apps/mail:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 2: tsc --noEmit

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 29
$ pnpm --filter @zero/server exec tsc --noEmit 2>&1 | tail -5
exit: 0  ms: 5633  bytes: 0

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 30
$ grep -rE ":\s*any\b|as any|<any>|\bany\[\]" apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src --include='*.ts' --include='*.tsx' --exclude='*.d.ts' --exclude='*.test.*' | wc -l
exit: 0  ms: 77  bytes: 9
      37

## RUN (mécanique — check-runner ; l'app hors périmètre de l'issue est informative) line 31
$ grep -rn "@ts-nocheck" apps/mail apps/server --include='*.ts' --include='*.tsx' --exclude='*.d.ts' | wc -l
exit: 0  ms: 47  bytes: 9
       0
