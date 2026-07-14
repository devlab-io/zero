# Checkrun: queue-view-checkrun
generated: 2026-07-06T02:22:27Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-queue-view-02.json
check_file: docs/checks/tartine/queue-view.md  freeze_sha: 3cb56cedaf8b46d15ec1009dc087b3008227a06e
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

## Runnable checks line 14
$ ls "apps/mail/app/(routes)/queue"
exit: 0  ms: 10  bytes: 9
page.tsx

## Runnable checks line 15
$ ls apps/mail/components/queue
exit: 0  ms: 11  bytes: 62
queue-review.tsx
queue-view-model.test.ts
queue-view-model.ts

## Runnable checks line 16
$ grep -rho "outbox" "apps/mail/app/(routes)/queue" apps/mail/components/queue | wc -l
exit: 0  ms: 9  bytes: 9
      11

## Runnable checks line 17
$ grep -c "queue" apps/mail/messages/en.json
exit: 0  ms: 9  bytes: 2
8

## Runnable checks line 18
$ grep -c "queue" apps/mail/messages/fr.json
exit: 0  ms: 9  bytes: 2
4

## Runnable checks line 19
$ test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 98 && echo TSC_NO_NEW_ERRORS
exit: 0  ms: 3452  bytes: 18
TSC_NO_NEW_ERRORS

## Runnable checks line 20
$ { git diff --name-only base/tartine-wave2..HEAD -- apps/server; git status --porcelain -- apps/server; } | wc -l
exit: 0  ms: 26  bytes: 9
       0

## Runnable checks line 21
$ { git diff --name-only base/tartine-wave2..HEAD -- "apps/mail/app/(routes)/mail" "apps/mail/app/(routes)/settings"; git status --porcelain -- "apps/mail/app/(routes)/mail" "apps/mail/app/(routes)/settings"; } | wc -l
exit: 0  ms: 25  bytes: 9
       0
