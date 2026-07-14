# Checkrun: docs-close-checkrun
generated: 2026-07-06T02:31:39Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-docs-close-01.json
check_file: docs/checks/tartine/docs-close.md  freeze_sha: 2f759dd5b2c123deed1a3dc4dd32da2b7ac20421
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=2f759dd5b2c123deed1a3dc4dd32da2b7ac20421
changed_files: 0 listed below; docs_checks_touched=false

## Runnable checks line 10
$ ls docs/solutions/ | wc -l
exit: 0  ms: 16  bytes: 9
       3

## Runnable checks line 11
$ grep -rli "wrangler types\|worker-configuration" docs/solutions/ | wc -l
exit: 0  ms: 11  bytes: 9
       1

## Runnable checks line 12
$ grep -rli "husky\|oxlint" docs/solutions/ | wc -l
exit: 0  ms: 11  bytes: 9
       1

## Runnable checks line 13
$ grep -rli "routes.ts" docs/solutions/ | wc -l
exit: 0  ms: 10  bytes: 9
       1

## Runnable checks line 14
$ test -f docs/FORK.md && echo FORK_OK
exit: 0  ms: 8  bytes: 8
FORK_OK

## Runnable checks line 15
$ grep -ci "draft.only" docs/FORK.md
exit: 0  ms: 10  bytes: 2
4

## Runnable checks line 16
$ grep -ci "sendEmail" docs/FORK.md
exit: 0  ms: 9  bytes: 2
2

## Runnable checks line 17
$ { git status --porcelain -- apps packages; } | wc -l
exit: 0  ms: 20  bytes: 9
       0
