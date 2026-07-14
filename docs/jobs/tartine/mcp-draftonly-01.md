MIRROR: ORCHESTRATOR

PHASE 0:

Plan:
1. Verify base commit and required input docs, then perform the requested offline install/type setup before tsc/vitest.
2. Use TDD for `apps/server/src/lib/mail-sanitize`: add failing sanitizer tests, implement HTML-to-text, hidden-text neutralization, and untrusted-source marking.
3. Replace the MCP send-capable tool in `apps/server/src/routes/agent/mcp.ts` with draft-only `createDraft` and `enqueueDraftJob`, importing the #2 outbox API without modifying it.
4. Apply sanitizer to MCP mail body read output, audit the route for remaining send capability, then run every frozen `RUN:` check in bash.

Disagreements:
- None found.

What I checked before finding none:
- `git rev-parse HEAD` returned `ed4f9e8f3ab8b596206fdc8d26702e3096d49fbb`, matching the required base.
- `docs/checks/tartine/mcp-draftonly.md:15-21` defines the seven frozen runnable checks; `:23-34` defines judge-only expectations for draft-only tools and sanitizer coverage.
- `docs/spec/agent-draft-queue.md:8-18` states the agent prepares drafts and never sends; `:43-47` maps this slice to removing the MCP send tool, adding `createDraft`/`enqueueDraftJob`, and sanitizing mail content.
- `apps/server/src/lib/draft-outbox/index.ts:31-37` defines the published input contract; `:115-129` shows `enqueueDraftJob(db, input)` inserting status `queued`.
- Current implementation evidence: `apps/server/src/routes/agent/mcp.ts:254-295` registers `createDraft`; `:298-330` calls `enqueueDraftJob`; `:381-407` sanitizes the `getThread` body content. Sanitizer implementation is in `apps/server/src/lib/mail-sanitize/index.ts:1-136`; tests are in `apps/server/src/lib/mail-sanitize/index.test.ts:1-38`.

What I built:
- Removed the MCP send-capable tool from `apps/server/src/routes/agent/mcp.ts`; literal `sendEmail` count is now zero.
- Added `createDraft` with `to`, optional `cc`/`bcc`, `subject`, `message`, and optional `threadId`; it calls `agent.createDraft` with `id: null`, so the Gmail driver follows `gmail.users.drafts.create` and does not send.
- Added `enqueueDraftJob`, scoped to the active MCP connection, using only the published `enqueueDraftJob(db, input)` export from `apps/server/src/lib/draft-outbox`.
- Added `apps/server/src/lib/mail-sanitize/` with parser-based HTML-to-text conversion, hidden segment removal for `display:none`, white-on-white, and zero-size font cases, plus a lightweight untrusted-content marker.
- Applied the sanitizer to `getThread` mail body content served through MCP.

Check evidence:

1. Executor: bash
Command:
`grep -c "sendEmail" apps/server/src/routes/agent/mcp.ts; true`
Output:
```text
0
```
Exit code: 0

2. Executor: bash
Command:
`grep -c "createDraft" apps/server/src/routes/agent/mcp.ts`
Output:
```text
2
```
Exit code: 0

3. Executor: bash
Command:
`grep -c "enqueueDraftJob" apps/server/src/routes/agent/mcp.ts`
Output:
```text
3
```
Exit code: 0

4. Executor: bash
Command:
`ls apps/server/src/lib/mail-sanitize/`
Output:
```text
index.test.ts
index.ts
```
Exit code: 0

5. Executor: bash
Command:
`cd apps/server && npx vitest run src/lib/mail-sanitize --reporter=basic 2>&1 | tail -15`
Output:
```text
        {
          "summary": false
        }
      ]
    ]
  }
}
 ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 6ms


 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  16:06:21
   Duration  188ms (transform 21ms, setup 0ms, collect 42ms, tests 6ms, environment 0ms, prepare 31ms)
```
Exit code: 0

6. Executor: bash
Command:
`test $(cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 81 && echo TSC_NO_NEW_ERRORS`
Output:
```text
TSC_NO_NEW_ERRORS
```
Exit code: 0

7. Executor: bash
Command:
`{ git diff --name-only base/tartine-wave2..HEAD -- apps/mail apps/server/src/db apps/server/src/trpc; git status --porcelain -- apps/mail apps/server/src/db apps/server/src/trpc; } | wc -l`
Output:
```text
       0
```
Exit code: 0

Sandbox limitations / substitutions:
- `pnpm install --offline --frozen-lockfile --ignore-scripts` ran successfully from the worktree root.
- Requested setup command `pnpm run types` in `apps/server` was attempted before any tsc/vitest. It failed in this sandbox because Wrangler first tried to write logs under `/Users/thomasverdenne/Library/Preferences/.wrangler/logs` (`EPERM`), then with redirected `HOME`/`XDG_CONFIG_HOME` still failed on `listen EPERM: operation not permitted 127.0.0.1` during runtime type generation.
- Substitute used: `HOME=/private/tmp/wrangler-home XDG_CONFIG_HOME=/private/tmp/wrangler-config ../../node_modules/.pnpm/node_modules/.bin/wrangler types worker-configuration.d.ts --env local --include-runtime false` from `apps/server`; it exited 0 and wrote `worker-configuration.d.ts`. The frozen tsc error-count check then passed locally.
- CodeGraph MCP was consulted before edits, but `codegraph_status` and `codegraph_context` both returned `user cancelled MCP tool call`; I fell back to direct file reads inside the requested worktree and mirrored that limitation here.

STATUS: DONE — all frozen RUN checks pass locally
