# Checkrun: b1-staging-baseline-checkrun
generated: 2026-07-06T04:41:34Z  runner: sh  config: .architect/checkrun-b1-01.json
check_file: docs/checks/perf/b1-staging-baseline.md  freeze_sha: e1aaeedf443aefac83b643e63d7fc91854d2f9e5
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=e1aaeedf443aefac83b643e63d7fc91854d2f9e5
changed_files: 0 listed below; docs_checks_touched=false

## Runnable checks line 12
$ grep -c "## B1" docs/research/perf-baseline.md
exit: 0  ms: 10  bytes: 2
1

## Runnable checks line 13
$ grep -cEi "LCP|TBT|CLS" docs/research/perf-baseline.md
exit: 0  ms: 10  bytes: 3
21

## Runnable checks line 14
$ grep -ci "hyperdrive" docs/research/perf-baseline.md
exit: 0  ms: 9  bytes: 2
9

## Runnable checks line 15
$ grep -cEi "sync initiale|initial sync" docs/research/perf-baseline.md
exit: 0  ms: 10  bytes: 2
5

## Runnable checks line 16
$ grep -cEi "goulot|bottleneck" docs/research/perf-baseline.md
exit: 0  ms: 10  bytes: 3
10

## Runnable checks line 17
$ grep -cEi "P[1-6]" docs/research/perf-baseline.md
exit: 0  ms: 9  bytes: 2
9

## Runnable checks line 18
$ git status --porcelain -- apps packages | wc -l
exit: 0  ms: 19  bytes: 9
       0
