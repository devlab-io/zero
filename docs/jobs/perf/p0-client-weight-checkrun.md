# Checkrun: p0-client-weight-checkrun
generated: 2026-07-06T06:19:25Z  runner: sh  config: .architect/checkrun-p0-01.json
check_file: docs/checks/perf/p0-client-weight.md  freeze_sha: 92e0d8bd7729e57786d33bad6ab316609d6bff2f
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=92e0d8bd7729e57786d33bad6ab316609d6bff2f
changed_files: 0 listed below; docs_checks_touched=false

## Runnable checks line 14
$ test $(stat -f%z apps/mail/public/email-preview.png) -lt 300000 && echo HERO_OK
exit: 0  ms: 11  bytes: 8
HERO_OK

## Runnable checks line 15
$ cd apps/mail && VITE_PUBLIC_BACKEND_URL="https://x.invalid" VITE_PUBLIC_APP_URL="https://x.invalid" npx react-router build > /tmp/p0-build.log 2>&1; echo "build exit: $?"
exit: 0  ms: 28915  bytes: 14
build exit: 0

## Runnable checks line 16
$ find apps/mail/build/client/assets -name "*.js" -size +900k | wc -l
exit: 0  ms: 14  bytes: 9
       0

## Runnable checks line 17
$ find apps/mail/build/client/assets -name "*.js" -exec stat -f%z {} + | awk '{s+=$1} END {print int(s/1024)}'
exit: 0  ms: 17  bytes: 5
4182

## Runnable checks line 18
$ test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 99 && echo TSC_NO_NEW_ERRORS
exit: 0  ms: 5368  bytes: 18
TSC_NO_NEW_ERRORS

## Runnable checks line 19
$ git status --porcelain -- apps/server packages | wc -l
exit: 0  ms: 26  bytes: 9
       0
