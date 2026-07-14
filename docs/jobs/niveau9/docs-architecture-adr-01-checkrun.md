# Checkrun: docs-architecture-adr-01-checkrun
generated: 2026-07-14T02:44:26Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-docs-adr-01.json
check_file: docs/checks/niveau9/docs-governance.md  freeze_sha: 1c82b196cbc87d629b18024cca3f4ac6b7372af2
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=031ea04a2729245a69bc6bc9ca124481285d8b14
changed_files: 20 listed below; docs_checks_touched=false
AGENT.md
ARCHITECTURE.md
FORK.md
LICENSE-NOTES.md
MCP.md
README.md
docs/adr/0007-do-agent-decomposition.md
docs/adr/0008-error-taxonomy.md
docs/adr/0009-license-posture.md
docs/adr/0010-testing-strategy.md
docs/adr/0011-microsoft-driver-frozen.md
docs/adr/README.md
docs/jobs/niveau9/docs-architecture-adr-01.md
docs/solutions/anti-metric-gaming.md
docs/solutions/authorizations-off-channel.md
docs/solutions/env-tsc-phantoms.md
docs/solutions/honest-labeling.md
docs/solutions/known-issues.md
docs/solutions/prettier-vs-lockfile.md
docs/solutions/zsh-word-split.md

## RUN (mécanique — check-runner) line 6
$ grep -rl "Zero Email Inc" apps packages | wc -l
exit: 0  ms: 149  bytes: 9
      22

## RUN (mécanique — check-runner) line 7
$ grep -n "Next.js" README.md | wc -l
exit: 0  ms: 11  bytes: 9
       0

## RUN (mécanique — check-runner) line 8
$ ls docs/adr/ | wc -l
exit: 0  ms: 13  bytes: 9
      15
