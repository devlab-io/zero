# Checkrun: server-console-sweep-02-checkrun
generated: 2026-07-13T19:18:23Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-console-sweep-02.json
check_file: docs/checks/niveau9/observability.md  freeze_sha: 66c0c50058aaf16fc0540610d3591411a1bf289a
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=53ad535971fe731ab79db0ee757eff30967b7ef6
changed_files: 10 listed below; docs_checks_touched=false
apps/server/src/routes/agent/chat-agent.ts
apps/server/src/routes/agent/labels.ts
apps/server/src/routes/agent/orchestrator.ts
apps/server/src/routes/agent/projection.ts
apps/server/src/routes/agent/recipients.ts
apps/server/src/routes/agent/sync.ts
apps/server/src/routes/agent/tools.ts
apps/server/src/routes/agent/topics.ts
apps/server/src/routes/agent/zero-driver.ts
docs/jobs/niveau9/server-console-sweep-02.md

## RUN (mécanique — check-runner) line 6
$ grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l
exit: 0  ms: 22  bytes: 9
       8

## RUN (mécanique — check-runner) line 7
$ grep -rE "console\." apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store --include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l
exit: 0  ms: 32  bytes: 9
     122

## RUN (mécanique — check-runner) line 8
$ grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" apps/server/src --include='*.ts' | wc -l
exit: 0  ms: 24  bytes: 9
       0
