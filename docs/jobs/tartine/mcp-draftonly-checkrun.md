# Checkrun: mcp-draftonly-checkrun
generated: 2026-07-06T02:08:25Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-mcp-draftonly-01.json
check_file: docs/checks/tartine/mcp-draftonly.md  freeze_sha: 3cb56cedaf8b46d15ec1009dc087b3008227a06e
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=ed4f9e8f3ab8b596206fdc8d26702e3096d49fbb
changed_files: 13 listed below; docs_checks_touched=false
apps/server/src/db/migrations/0038_famous_malcolm_colcord.sql
apps/server/src/db/migrations/meta/0038_snapshot.json
apps/server/src/db/migrations/meta/_journal.json
apps/server/src/db/schema.ts
apps/server/src/lib/draft-outbox/index.ts
apps/server/src/lib/draft-outbox/state-machine.test.ts
apps/server/src/lib/draft-outbox/state-machine.ts
apps/server/src/routes/agent/index.ts
apps/server/src/trpc/index.ts
apps/server/src/trpc/routes/outbox.ts
docs/jobs/tartine/outbox-core-01.md
docs/jobs/tartine/outbox-core-checkrun.md
docs/jobs/tartine/outbox-core-rulings.md

## Runnable checks line 15
$ grep -c "sendEmail" apps/server/src/routes/agent/mcp.ts; true
exit: 0  ms: 11  bytes: 2
0

## Runnable checks line 16
$ grep -c "createDraft" apps/server/src/routes/agent/mcp.ts
exit: 0  ms: 10  bytes: 2
2

## Runnable checks line 17
$ grep -c "enqueueDraftJob" apps/server/src/routes/agent/mcp.ts
exit: 0  ms: 10  bytes: 2
3

## Runnable checks line 18
$ ls apps/server/src/lib/mail-sanitize/
exit: 0  ms: 9  bytes: 23
index.test.ts
index.ts

## Runnable checks line 19
$ cd apps/server && npx vitest run src/lib/mail-sanitize --reporter=basic 2>&1 | tail -15
exit: 0  ms: 715  bytes: 302
        {
          "summary": false
        }
      ]
    ]
  }
}
 ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 5ms


 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  16:08:26
   Duration  203ms (transform 21ms, setup 0ms, collect 42ms, tests 5ms, environment 0ms, prepare 30ms)


## Runnable checks line 20
$ test $(cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 81 && echo TSC_NO_NEW_ERRORS
exit: 0  ms: 3131  bytes: 18
TSC_NO_NEW_ERRORS

## Runnable checks line 21
$ { git diff --name-only base/tartine-wave2..HEAD -- apps/mail apps/server/src/db apps/server/src/trpc; git status --porcelain -- apps/mail apps/server/src/db apps/server/src/trpc; } | wc -l
exit: 0  ms: 27  bytes: 9
       0
