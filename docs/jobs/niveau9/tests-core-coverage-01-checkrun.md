# Checkrun: tests-core-coverage-01-checkrun
generated: 2026-07-13T20:01:30Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-tests-core-01.json
check_file: docs/checks/niveau9/tests.md  freeze_sha: e03908929ac26061ccb48472f18d00b5270d0975
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=9188830df3ed139de3dff0bbd2cda64b84772c1c
changed_files: 11 listed below; docs_checks_touched=false
apps/mail/hooks/use-optimistic-actions.test.ts
apps/mail/lib/optimistic-actions-manager.test.ts
apps/mail/store/optimistic-updates.test.ts
apps/server/src/env-schema.boot.test.ts
apps/server/src/lib/auth-providers.test.ts
apps/server/src/lib/driver/__fixtures__/batch-http-fake.ts
apps/server/src/lib/driver/google-transport.test.ts
apps/server/src/lib/google-scopes.test.ts
apps/server/src/trpc/routes/mail.test.ts
docs/jobs/niveau9/tests-core-coverage-01-checkrun.md
docs/jobs/niveau9/tests-core-coverage-01.md

## RUN (mécanique — check-runner) line 6
$ pnpm test
exit: 0  ms: 3927  bytes: 9180 truncated

> zero@0.1.0 test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01
> turbo run test

turbo 2.5.6

• Packages in scope: @zero/cli, @zero/eslint-config, @zero/mail, @zero/server, @zero/testing, @zero/tsconfig, @zero/types
• Running test in 7 packages
• Remote caching disabled
@zero/server:test: cache bypass, force executing a956ea0b90459156
@zero/mail:test: cache bypass, force executing 618455866ba259d8
@zero/server:test: 
@zero/server:test: > @zero/server@ test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/server
@zero/server:test: > vitest run
@zero/server:test: 
@zero/mail:test: 
@zero/mail:test: > @zero/mail@0.1.0 test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/mail
@zero/mail:test: > vitest run
@zero/mail:test: 
@zero/server:test: 
@zero/server:test:  RUN  v3.2.7 /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/server
@zero/server:test: 
@zero/mail:test: 
@zero/mail:test:  RUN  v3.2.7 /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/mail
@zero/mail:test: 
@zero/server:test:  ✓ src/lib/google-scopes.test.ts (5 tests) 4ms
@zero/server:test:  ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 3ms
@zero/server:test:  ✓ src/env-schema.test.ts (5 tests) 3ms
@zero/server:test:  ✓ src/env-schema.boot.test.ts (23 tests) 6ms
@zero/server:test:  ✓ src/lib/driver/gmail-backoff.test.ts (17 tests) 6ms
@zero/server:test:  ✓ src/routes/agent/mcp-tools.test.ts (20 tests) 9ms
@zero/server:test:  ✓ src/lib/errors.test.ts (6 tests) 3ms
@zero/server:test:  ✓ src/lib/driver/gmail-sync-persist.test.ts (4 tests) 4ms
@zero/server:test:  ✓ src/lib/sentry.test.ts (5 tests) 7ms
@zero/server:test:  ✓ src/lib/driver/gmail-batch.test.ts (17 tests) 34ms
@zero/server:test:  ✓ src/lib/auth-providers.test.ts (7 tests) 4ms
@zero/server:test:  ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 16ms
@zero/server:test:  ✓ src/trpc/routes/mail.test.ts (43 tests) 63ms
@zero/mail:test:  ✓ lib/optimistic-actions-manager.test.ts (4 tests) 2ms
@zero/mail:test:  ✓ components/queue/queue-view-model.test.ts (2 tests) 2ms
@zero/mail:test:  ✓ components/mail/reply-recipients.test.ts (17 tests) 4ms
@zero/server:test:  ✓ src/lib/driver/google-transport.test.ts (20 tests) 16ms
@zero/mail:test:  ✓ lib/optimistic-recovery.test.ts (4 tests) 2ms
@zero/mail:test:  ✓ lib/mail-list-state.test.ts (6 tests) 3ms
@zero/mail:test:  ✓ lib/composer-flush.test.ts (4 tests) 3ms
@zero/mail:test:  ✓ lib/draft-storage.test.ts (7 tests) 5ms
@zero/mail:test:  ✓ lib/thread-view-state.test.ts (6 tests) 2ms
@zero/mail:test:  ✓ components/mail/mail-list-thread.test.ts (5 tests) 3ms
@zero/mail:test:  ✓ store/optimistic-updates.test.ts (6 tests) 6ms
@zero/mail:test:  ✓ components/mail/label-move-picker.logic.test.ts (3 tests) 2ms
@zero/mail:test:  ✓ components/create/send-and-archive.test.ts (4 tests) 3ms
@zero/mail:test:  ✓ components/ui/animated-number.test.ts (5 tests) 4ms
@zero/mail:test:  ✓ lib/query-retry.test.ts (6 tests) 59ms
@zero/mail:test: stderr | hooks/use-optimistic-actions.test.ts > useOptimisticActions — markAsRead (silent = exécution directe) > chemin d’erreur (post-#34) : undo + réconciliation liste + toast.error avec action Retry
@zero/mail:test: Action failed: Error: net
@zero/mail:test:     at [90m/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/mail/[39mhooks/use-optimistic-actions.test.ts:149:68
@zero/mail:test:     at file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/[4m.pnpm[24m/@vitest+runner@3.2.7/node_modules/[4m@vitest/runner[24m/dist/chunk-hooks.js:155:11
@zero/mail:test:     at file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/[4m.pnpm[24m/@vitest+runner@3.2.7/node_modules/[4m@vitest/runner[24m/dist/chunk-hooks.js:752:26
@zero/mail:test:     at file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/[4m.pnpm[24m/@vitest+runner@3.2.7/node_modules/[4m@vitest/runner[24m/dist/chunk-hooks.js:1897:20
@zero/mail:test:     at new Promise (<anonymous>)
