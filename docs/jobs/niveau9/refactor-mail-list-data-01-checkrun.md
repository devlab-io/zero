# Checkrun: refactor-mail-list-data-01-checkrun
generated: 2026-07-13T14:44:07Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-refactor-mail-list-data-01.json
check_file: docs/checks/niveau9/structure.md  freeze_sha: 85451f71
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=fb944ed2f6a551c439c0e9ba7e5c5bad351ea5ae
changed_files: 89 listed below; docs_checks_touched=false
.gitignore
apps/mail/components/mail/mail-list-draft.tsx
apps/mail/components/mail/mail-list-labels.tsx
apps/mail/components/mail/mail-list-thread-actions.tsx
apps/mail/components/mail/mail-list-thread.tsx
apps/mail/components/mail/mail-list-utils.ts
apps/mail/components/mail/mail-list.tsx
apps/mail/components/ui/ai-sidebar.tsx
apps/mail/components/ui/prompts-dialog.tsx
apps/mail/hooks/use-mail-list-data.ts
apps/mail/hooks/use-mail-selection.ts
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
docs/jobs/niveau9/refactor-mail-list-data-01-rulings.md
docs/jobs/niveau9/refactor-mail-list-data-01.md
docs/jobs/niveau9/server-runtime-guardrails-01-checkrun.md
docs/jobs/niveau9/server-runtime-guardrails-01-rulings.md
docs/jobs/niveau9/server-runtime-guardrails-01.md
docs/jobs/niveau9/shared-types-package-01-checkrun-structure.md
docs/jobs/niveau9/shared-types-package-01-checkrun.md
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

## RUN (mécanique — check-runner) line 6
$ grep -rnE "(\.\./)+server/src" apps/mail --include='*.ts' --include='*.tsx' | wc -l
exit: 0  ms: 78  bytes: 9
       0

## RUN (mécanique — check-runner) line 7
$ find apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts' ! -name '*.test.*' -exec wc -l {} + | sort -rn | head -15
exit: 0  ms: 45  bytes: 723
   65523 total
    1922 apps/mail/components/context/command-palette-context.tsx
    1736 apps/mail/components/mail/mail-display.tsx
    1332 apps/mail/components/home/HomeContent.tsx
    1293 apps/server/src/lib/driver/microsoft.ts
    1169 apps/mail/components/create/email-composer.tsx
    1062 apps/mail/components/mail/thread-display.tsx
     873 apps/server/src/pipelines.ts
     871 apps/server/src/trpc/routes/mail.ts
     849 apps/mail/components/mail/mail.tsx
     768 apps/server/src/thread-workflow-utils/workflow-functions.ts
     756 apps/mail/app/(full-width)/contributors.tsx
     663 apps/mail/components/ui/nav-user.tsx
     631 apps/mail/lib/utils.ts
     630 apps/mail/components/queue/queue-review.tsx
