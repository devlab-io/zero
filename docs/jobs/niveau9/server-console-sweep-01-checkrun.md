# Checkrun: server-console-sweep-01-checkrun
generated: 2026-07-13T18:44:08Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-console-sweep-01.json
check_file: docs/checks/niveau9/observability.md  freeze_sha: 5331ac6a7aa916b7ff1f68edb72dc57226a2def2
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=e93b52041a6ffe5cc65fe9f2be6f1f89f58dd704
changed_files: 7 listed below; docs_checks_touched=false
apps/server/src/lib/driver/google-account.ts
apps/server/src/lib/driver/google-drafts.ts
apps/server/src/lib/driver/google-threads.ts
apps/server/src/lib/driver/google-transport.ts
apps/server/src/lib/driver/microsoft.ts
apps/server/src/lib/driver/utils.ts
docs/jobs/niveau9/server-console-sweep-01.md

## RUN (mécanique — check-runner) line 6
$ grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l
exit: 0  ms: 87  bytes: 9
      87

## RUN (mécanique — check-runner) line 7
$ grep -rE "console\." apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store --include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l
exit: 0  ms: 156  bytes: 9
     122

## RUN (mécanique — check-runner) line 8
$ grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" apps/server/src --include='*.ts' | wc -l
exit: 0  ms: 69  bytes: 9
       0
