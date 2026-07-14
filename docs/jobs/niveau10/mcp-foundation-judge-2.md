MIRROR: ORCHESTRATOR

- Checks integrity: PASS
  Raw evidence:
  ```text
  $ git diff e08ef425cfd50b1491ef5771ff86c595b7f2f63c..HEAD -- docs/checks/
  [no stdout/stderr]
  exit: 0

  check_file_matches_freeze=true
  freeze_sha=e08ef425cfd50b1491ef5771ff86c595b7f2f63c

  $ git hash-object docs/checks/niveau10/mcp-foundation.md
  7ccc6df3349676393cb8db83d22bcb0c56b7b346
  $ git rev-parse e08ef425cfd50b1491ef5771ff86c595b7f2f63c:docs/checks/niveau10/mcp-foundation.md
  7ccc6df3349676393cb8db83d22bcb0c56b7b346
  exit: 0
  ```
  Final tree audit:
  ```text
  $ git diff --exit-code
  [no stdout/stderr]
  exit: 0
  $ git diff --cached --exit-code
  [no stdout/stderr]
  exit: 0
  $ git status --porcelain=v1 --untracked-files=all
  [no stdout/stderr]
  exit: 0
  ```

- Diff vs intent: PASS
  Raw evidence: The frozen cap is specified at [docs/checks/niveau10/mcp-foundation.md:26](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/docs/checks/niveau10/mcp-foundation.md:26) and [docs/spec/niveau10-mailos.md:140](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/docs/spec/niveau10-mailos.md:140). The correction iterates every contextual message and rejects `to + cc > 50` at [mcp-tools.ts:471](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/apps/server/src/routes/agent/mcp-tools.ts:471). The unchanged top-level and draft caps remain at lines 460–480. Production registers that refined schema before the callback at [mcp.ts:294](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/apps/server/src/routes/agent/mcp.ts:294); the SDK validates before invoking the handler. The regression test proves exactly 50 is accepted and 51 does not reach the fake driver at [mcp-tools.test.ts:315](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/apps/server/src/routes/agent/mcp-tools.test.ts:315).
  ```text
  {"context_exact_50":true,"context_51_rejected":true,"every_context_item_checked":true,"top_level_exact_50":true,"top_level_51_rejected":true,"draft_exact_50":true,"draft_51_rejected":true}
  exit_code=0
  ```
  Draft-only/security invariants remain guarded by [check-agent-surface.mjs:59](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/scripts/security/check-agent-surface.mjs:59).

- Per check:
  - RUN line 9: PASS
    Command: `pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-auth.test.ts src/routes/agent/mcp-account.test.ts src/routes/agent/mcp-idempotency.test.ts src/routes/agent/mcp-tools.test.ts`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0

     RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/apps/server

     ✓ src/routes/agent/mcp-account.test.ts (2 tests) 3ms
     ✓ src/routes/agent/mcp-idempotency.test.ts (3 tests) 13ms
     ✓ src/routes/agent/mcp-tools.test.ts (20 tests) 12ms
     ✓ src/routes/agent/mcp-auth.test.ts (4 tests) 10ms

     Test Files  4 passed (4)
          Tests  29 passed (29)
       Duration  280ms
    ```

  - RUN line 10: PASS
    Command: `node scripts/security/check-agent-surface.mjs`
    Executor: bash
    Source: re-run
    Raw evidence:
    ```text
    Security surface check passed: least scopes, bounded session cache, draft-only MCP.
    exit: 0
    ```
    This exactly matches the evidence-file output.

  - RUN line 11: PASS
    Command: `pnpm --filter @zero/server exec eslint src/routes/index.ts src/lib/logger.ts src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
    exit: 0
    ```

  - RUN line 12: PASS
    Command: `pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    > @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/apps/server
    > wrangler types --env local

    ⛅️ wrangler 4.32.0
    Generating project types...
    Generating runtime types...
    Runtime types generated.
    exit: 0
    ```

  - RUN line 13: PASS
    Command: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/(src\/routes\/index\.ts|src\/lib\/logger\.ts|src\/routes\/agent\/mcp[^\/]*\.ts)|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-foundation-01\.md)$/ {print; bad=1} END {exit bad}'`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    [no stdout/stderr]
    exit: 0
    ```

  - RUN line 14: PASS
    Command: `git diff --check`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    [no stdout/stderr]
    exit: 0
    ```

- Slice verdict: PASS
  Decisive reason: Every `threadMessages` item now enforces the combined 50-recipient boundary before the production callback, exactly 50 remains valid, the top-level and draft caps remain effective, and the unchanged draft-only guard reproduced the recorded output exactly.

Proposition de capture Open Brain, non envoyée : verdict PASS et preuve du correctif de cap contextuel, après validation humaine explicite.

