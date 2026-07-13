# Checkrun: tests-core-coverage-01-checkrun
generated: 2026-07-13T19:04:21Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-tests-core-01.json
check_file: docs/checks/niveau9/tests.md  freeze_sha: 5331ac6a7aa916b7ff1f68edb72dc57226a2def2
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=5187b91252142bd595ac5862a2d88c4284fb5a0c
changed_files: 10 listed below; docs_checks_touched=false
apps/mail/hooks/use-optimistic-actions.test.ts
apps/mail/lib/optimistic-actions-manager.test.ts
apps/mail/store/optimistic-updates.test.ts
apps/server/src/env-schema.boot.test.ts
apps/server/src/lib/auth-providers.test.ts
apps/server/src/lib/driver/__fixtures__/batch-http-fake.ts
apps/server/src/lib/driver/google-transport.test.ts
apps/server/src/lib/google-scopes.test.ts
apps/server/src/trpc/routes/mail.test.ts
docs/jobs/niveau9/tests-core-coverage-01.md

## RUN (mécanique — check-runner) line 6
$ pnpm test
exit: 0  ms: 5319  bytes: 13967 truncated

> zero@0.1.0 test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01
> turbo run test

turbo 2.5.6

• Packages in scope: @zero/cli, @zero/eslint-config, @zero/mail, @zero/server, @zero/testing, @zero/tsconfig, @zero/types
• Running test in 7 packages
• Remote caching disabled
@zero/server:test: cache bypass, force executing c8151ae05a8e8999
@zero/mail:test: cache bypass, force executing 442d2b173662809d
@zero/mail:test: 
@zero/mail:test: > @zero/mail@0.1.0 test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/mail
@zero/mail:test: > vitest run
@zero/mail:test: 
@zero/server:test: 
@zero/server:test: > @zero/server@ test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/server
@zero/server:test: > vitest run
@zero/server:test: 
@zero/server:test: 
@zero/server:test:  RUN  v3.2.7 /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/server
@zero/server:test: 
@zero/mail:test: 
@zero/mail:test:  RUN  v3.2.7 /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/mail
@zero/mail:test: 
@zero/server:test:  ✓ src/lib/driver/gmail-backoff.test.ts (17 tests) 6ms
@zero/server:test:  ✓ src/lib/google-scopes.test.ts (5 tests) 3ms
@zero/server:test:  ✓ src/lib/sentry.test.ts (5 tests) 8ms
@zero/server:test:  ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 10ms
@zero/server:test:  ✓ src/lib/auth-providers.test.ts (7 tests) 4ms
@zero/server:test:  ✓ src/lib/driver/gmail-batch.test.ts (17 tests) 35ms
@zero/server:test:  ✓ src/env-schema.test.ts (5 tests) 11ms
@zero/server:test:  ✓ src/env-schema.boot.test.ts (23 tests) 5ms
@zero/server:test:  ✓ src/lib/errors.test.ts (6 tests) 6ms
@zero/server:test:  ✓ src/lib/driver/gmail-sync-persist.test.ts (4 tests) 4ms
@zero/server:test:  ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 9ms
@zero/mail:test:  ✓ components/create/send-and-archive.test.ts (4 tests) 2ms
@zero/mail:test:  ✓ components/mail/reply-recipients.test.ts (17 tests) 4ms
@zero/mail:test:  ✓ components/mail/label-move-picker.logic.test.ts (3 tests) 2ms
@zero/mail:test:  ✓ store/optimistic-updates.test.ts (6 tests) 5ms
@zero/server:test: stderr | src/lib/driver/google-transport.test.ts > GmailTransport — error handlers (async & sync) > withErrorHandler : erreur NON fatale → wrap + rethrow, sans supprimer la connexion
@zero/server:test: [ERROR] [Gmail Driver] Operation: op {
@zero/server:test:   error: [32m'boom'[39m,
@zero/server:test:   code: [90mundefined[39m,
@zero/server:test:   context: [90mundefined[39m,
@zero/server:test:   stack: [32m'Error: boom\n'[39m +
@zero/server:test:     [32m'    at /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/server/src/lib/driver/google-transport.test.ts:280:15\n'[39m +
@zero/server:test:     [32m'    at GmailTransport.withErrorHandler (/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/server/src/lib/driver/google-transport.ts:241:36)\n'[39m +
@zero/server:test:     [32m'    at /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/apps/server/src/lib/driver/google-transport.test.ts:279:9\n'[39m +
@zero/server:test:     [32m'    at file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11\n'[39m +
@zero/server:test:     [32m'    at file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26\n'[39m +
@zero/server:test:     [32m'    at file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20\n'[39m +
@zero/server:test:     [32m'    at new Promise (<anonymous>)\n'[39m +
@zero/server:test:     [32m'    at runWithTimeout (file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)\n'[39m +
@zero/server:test:     [32m'    at runTest (file:///Users/thomasverdenne/cc/zero/.architect/wt/niveau9/tests-core-coverage-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)\n'[39m +
@zero/server:test:     [32m'    at processTicksAndRejections (node:internal/process/task_queues:103:5)'[39m,
@zero/server:test:   isFatal: [33mfalse[39m
@zero/server:test: }
@zero/server:test: 
@zero/server:test: stderr | src/lib/driver/google-transport.test.ts > GmailTransport — error handlers (async & sync) > withErrorHandler : erreur FATALE → supprime la connexion active puis rethrow
