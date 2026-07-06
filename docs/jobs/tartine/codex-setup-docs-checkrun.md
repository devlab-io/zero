# Checkrun: codex-setup-docs-checkrun
generated: 2026-07-06T02:16:05Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-codex-setup-docs-01.json
check_file: docs/checks/tartine/codex-setup-docs.md  freeze_sha: 3cb56cedaf8b46d15ec1009dc087b3008227a06e
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=89488a9f2dad762a28537fc5ae2833b74d78c37e
changed_files: 18 listed below; docs_checks_touched=false
apps/server/src/db/migrations/0038_famous_malcolm_colcord.sql
apps/server/src/db/migrations/meta/0038_snapshot.json
apps/server/src/db/migrations/meta/_journal.json
apps/server/src/db/schema.ts
apps/server/src/lib/draft-outbox/index.ts
apps/server/src/lib/draft-outbox/state-machine.test.ts
apps/server/src/lib/draft-outbox/state-machine.ts
apps/server/src/lib/mail-sanitize/index.test.ts
apps/server/src/lib/mail-sanitize/index.ts
apps/server/src/routes/agent/index.ts
apps/server/src/routes/agent/mcp.ts
apps/server/src/trpc/index.ts
apps/server/src/trpc/routes/outbox.ts
docs/jobs/tartine/mcp-draftonly-01.md
docs/jobs/tartine/mcp-draftonly-checkrun.md
docs/jobs/tartine/outbox-core-01.md
docs/jobs/tartine/outbox-core-checkrun.md
docs/jobs/tartine/outbox-core-rulings.md

## Runnable checks line 10
$ test -f docs/agent/codex-setup.md && echo DOC_OK
exit: 0  ms: 11  bytes: 7
DOC_OK

## Runnable checks line 11
$ grep -c "mcp_servers.zero" docs/agent/codex-setup.md
exit: 0  ms: 12  bytes: 2
1

## Runnable checks line 12
$ grep -c "/mcp" docs/agent/codex-setup.md
exit: 0  ms: 10  bytes: 2
4

## Runnable checks line 13
$ grep -ci "draft.only" docs/agent/codex-setup.md
exit: 0  ms: 11  bytes: 2
4

## Runnable checks line 14
$ grep -c "codex mcp login zero" docs/agent/codex-setup.md
exit: 0  ms: 10  bytes: 2
2

## Runnable checks line 15
$ ls docs/agent/ | wc -l
exit: 0  ms: 11  bytes: 9
       2

## Runnable checks line 16
$ { git diff --name-only base/tartine-wave3..HEAD -- apps packages; git status --porcelain -- apps packages; } | wc -l
exit: 0  ms: 28  bytes: 9
       0
