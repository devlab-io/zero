# Checkrun: b0-local-baseline-checkrun
generated: 2026-07-06T03:05:22Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-b0-01.json
check_file: docs/checks/perf/b0-local-baseline.md  freeze_sha: 64570dbdfa13146902450df946536094dbe43c78
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=64570dbdfa13146902450df946536094dbe43c78
changed_files: 0 listed below; docs_checks_touched=false

## Runnable checks line 10
$ test -f docs/research/perf-baseline.md && echo REPORT_OK
exit: 0  ms: 11  bytes: 10
REPORT_OK

## Runnable checks line 11
$ grep -c "## B0" docs/research/perf-baseline.md
exit: 0  ms: 13  bytes: 2
1

## Runnable checks line 12
$ grep -cEi "LCP|TBT|CLS" docs/research/perf-baseline.md
exit: 0  ms: 12  bytes: 3
10

## Runnable checks line 13
$ grep -cEi "médiane|median" docs/research/perf-baseline.md
exit: 0  ms: 12  bytes: 2
5

## Runnable checks line 14
$ grep -cEi "goulot|bottleneck|non concluant|inconclusive" docs/research/perf-baseline.md
exit: 0  ms: 12  bytes: 2
6

## Runnable checks line 15
$ git status --porcelain -- apps packages | wc -l
exit: 0  ms: 21  bytes: 9
       0
