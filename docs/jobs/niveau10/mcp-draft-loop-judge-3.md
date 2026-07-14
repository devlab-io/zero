Checks integrity: PASS
Raw evidence: `git diff fa191d4540536ce52e579e156d7dab6b3a4e0c1b..HEAD -- docs/checks/` produced no output; exit 0. Checkrun records `check_file_matches_freeze=true`, matching freeze SHA, and only the evidence file changed after the recorded head.

Diff vs intent: FAIL
Raw evidence: The frozen check requires an obsolete revision to be rejected without overwriting at `docs/checks/niveau10/mcp-draft-loop.md:22-23`; the spec requires a conditional update and says a stale revision changes nothing at `docs/spec/niveau10-mailos.md:138` and `:146-148`. The handler reads and checks the revision at `apps/server/src/routes/agent/mcp-draft-loop.ts:186-188`, then performs a separate write at `:189-199`. The opaque revision is only a hash of the fetched projection at `apps/server/src/lib/driver/agent-drafts.ts:191-224`; no provider concurrency token is carried. Gmail performs an unconditional `drafts.update` at `apps/server/src/lib/driver/google-drafts.ts:244-251`, and Outlook performs an unconditional patch at `apps/server/src/lib/driver/microsoft.ts:726-729`. Therefore, an edit occurring after the check but before the write is overwritten, violating the stale-revision contract.

Per check:

- RUN line 9: PASS
  Command: `pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts src/routes/agent/mcp-tools.test.ts`
  Source: evidence-file
  Raw evidence:
  ```text
   RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

   ✓ src/routes/agent/mcp-tools.test.ts (23 tests) 10ms
   ✓ src/routes/agent/mcp-draft-loop.test.ts (14 tests) 54ms

   Test Files  2 passed (2)
        Tests  37 passed (37)
     Start at  03:58:47
     Duration  786ms (transform 152ms, setup 0ms, collect 633ms, tests 63ms, environment 0ms, prepare 82ms)

  exit: 0
  ```

- RUN line 10: PASS
  Command: `node scripts/security/check-agent-surface.mjs`
  Source: re-run
  Raw evidence:
  ```text
  Security surface check passed: least scopes, bounded session cache, draft-only MCP.
  exit: 0
  ```
  This exactly matches the evidence-file stdout and exit code.

- RUN line 11: PASS
  Command: `pnpm --filter @zero/server exec eslint src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm exec prettier apps/server/src/lib/driver/microsoft.ts docs/agent --check`
  Source: evidence-file
  Raw evidence:
  ```text
  Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
  Checking formatting...
  All matched files use Prettier code style!
  exit: 0
  ```

- RUN line 12: PASS
  Command: `pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit`
  Source: evidence-file
  Raw evidence:
  ```text
  > @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server
  > wrangler types --env local

   ⛅️ wrangler 4.32.0 (update available 4.110.0)
  ──────────────────────────────────────────────
  Generating project types...
  Generating runtime types...

  Runtime types generated.

  ✨ Types written to worker-configuration.d.ts

  📖 Read about runtime types
  https://developers.cloudflare.com/workers/languages/typescript/
  📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.

  exit: 0
  ```

- RUN line 13: PASS
  Command: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/src\/(routes\/agent\/mcp[^\/]*\.ts|lib\/driver\/.*)|docs\/agent\/.*|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-draft-loop-01\.md)$/ {print; bad=1} END {exit bad}'`
  Source: evidence-file
  Raw evidence:
  ```text
  [no stdout]
  exit: 0
  ```

- RUN line 14: PASS
  Command: `git diff --check`
  Source: evidence-file
  Raw evidence:
  ```text
  [no stdout]
  exit: 0
  ```

Slice verdict: FAIL
Decisive reason: The provider update is not conditional on the supplied revision, so a concurrent edit can become stale after the pre-read and still be overwritten by the unconditional Gmail or Outlook write.
