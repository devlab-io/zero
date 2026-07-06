# Checkrun: outbox-core-checkrun
generated: 2026-07-06T01:51:33Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-outbox-core-01.json
check_file: docs/checks/tartine/outbox-core.md  freeze_sha: 3cb56cedaf8b46d15ec1009dc087b3008227a06e
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=3cb56cedaf8b46d15ec1009dc087b3008227a06e
changed_files: 0 listed below; docs_checks_touched=false

## Runnable checks line 14
$ grep -c "draft_outbox" apps/server/src/db/schema.ts
exit: 0  ms: 15  bytes: 2
4

## Runnable checks line 15
$ grep -rl "draft_outbox" apps/server/src/db/migrations | wc -l
exit: 0  ms: 28  bytes: 9
       2

## Runnable checks line 16
$ test -f apps/server/src/trpc/routes/outbox.ts && echo ROUTER_OK
exit: 0  ms: 10  bytes: 10
ROUTER_OK

## Runnable checks line 17
$ grep -c "outbox" apps/server/src/trpc/index.ts
exit: 0  ms: 12  bytes: 2
2

## Runnable checks line 18
$ ls apps/server/src/lib/draft-outbox/
exit: 0  ms: 11  bytes: 48
index.ts
state-machine.test.ts
state-machine.ts

## Runnable checks line 19
$ cd apps/server && npx vitest run src/lib/draft-outbox --reporter=basic 2>&1 | tail -15
exit: 0  ms: 695  bytes: 309
        {
          "summary": false
        }
      ]
    ]
  }
}
 ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 2ms


 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  15:51:33
   Duration  211ms (transform 25ms, setup 0ms, collect 20ms, tests 2ms, environment 0ms, prepare 44ms)


## Runnable checks line 20
$ test $(cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 81 && echo TSC_NO_NEW_ERRORS
exit: 0  ms: 2601  bytes: 18
TSC_NO_NEW_ERRORS

## Runnable checks line 21
$ { git diff --name-only freeze/tartine..HEAD -- apps/mail apps/server/src/routes/agent/mcp.ts; git status --porcelain -- apps/mail apps/server/src/routes/agent/mcp.ts; } | wc -l
exit: 0  ms: 33  bytes: 9
       0
