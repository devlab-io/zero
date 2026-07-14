# Checkrun: test-harness-01-checkrun
generated: 2026-07-13T07:59:30Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-test-harness-01.json
check_file: docs/checks/niveau9/tests.md  freeze_sha: fc4a74c1414bdc39729ae73a8e79d257ff08b884
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=9f9b5fe1570cae7cb48be32e68c8ea696faae5f4
changed_files: 10 listed below; docs_checks_touched=false
apps/mail/package.json
apps/mail/vitest.config.ts
apps/server/package.json
apps/server/vitest.config.ts
docs/jobs/niveau9/test-harness-01-rulings.md
docs/jobs/niveau9/test-harness-01.md
docs/testing.md
package.json
pnpm-lock.yaml
turbo.json

## RUN (mécanique — check-runner) line 6
$ pnpm test
exit: 0  ms: 1677  bytes: 1983

> zero@0.1.0 test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/test-harness-01
> turbo run test

turbo 2.5.6

• Packages in scope: @zero/cli, @zero/eslint-config, @zero/mail, @zero/server, @zero/testing, @zero/tsconfig
• Running test in 6 packages
• Remote caching disabled
@zero/mail:test: cache bypass, force executing 7c444cce5d403022
@zero/server:test: cache bypass, force executing edde559670826bd3
@zero/mail:test: 
@zero/mail:test: > @zero/mail@0.1.0 test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/test-harness-01/apps/mail
@zero/mail:test: > vitest run
@zero/mail:test: 
@zero/server:test: 
@zero/server:test: > @zero/server@ test /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/test-harness-01/apps/server
@zero/server:test: > vitest run
@zero/server:test: 
@zero/server:test: 
@zero/server:test:  RUN  v3.2.7 /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/test-harness-01/apps/server
@zero/server:test: 
@zero/mail:test: 
@zero/mail:test:  RUN  v3.2.7 /Users/thomasverdenne/cc/zero/.architect/wt/niveau9/test-harness-01/apps/mail
@zero/mail:test: 
@zero/server:test:  ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 3ms
@zero/server:test:  ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 7ms
@zero/server:test: 
@zero/server:test:  Test Files  2 passed (2)
@zero/server:test:       Tests  7 passed (7)
@zero/server:test:    Start at  21:59:31
@zero/server:test:    Duration  308ms (transform 37ms, setup 0ms, collect 64ms, tests 10ms, environment 0ms, prepare 94ms)
@zero/server:test: 
@zero/mail:test:  ✓ components/queue/queue-view-model.test.ts (2 tests) 2ms
@zero/mail:test: 
@zero/mail:test:  Test Files  1 passed (1)
@zero/mail:test:       Tests  2 passed (2)
@zero/mail:test:    Start at  21:59:31
@zero/mail:test:    Duration  404ms (transform 23ms, setup 0ms, collect 14ms, tests 2ms, environment 119ms, prepare 82ms)
@zero/mail:test: 

 Tasks:    2 successful, 2 total
Cached:    0 cached, 2 total
  Time:    818ms 

