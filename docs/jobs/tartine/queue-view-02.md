PHASE 0:

MIRROR: ORCHESTRATOR

Plan:
1. Verify the required base commit and inherited work without redoing the completed slice.
2. Apply only the newly approved additive `/queue` registration in `apps/mail/app/routes.ts`, before the catch-all.
3. Verify the route mounts.
4. Re-run every frozen `- RUN:` command from `docs/checks/tartine/queue-view.md` in bash from the worktree root.
5. Run the queue Vitest sanity check using the inherited working binary path if `apps/mail` local `npx vitest` is unavailable.

Disagreements / what I checked:
- `git rev-parse HEAD` matched the required base: `ed4f9e8f3ab8b596206fdc8d26702e3096d49fbb`.
- Read `docs/checks/tartine/queue-view.md` and `docs/jobs/tartine/queue-view-01.md`.
- `git status --porcelain` before my edit confirmed the inherited work was present in the queue route/components, sidebar/navigation, EN/FR messages, and `docs/jobs/tartine/queue-view-01.md`.
- No disagreement with the amended ruling. I made the route registration in `apps/mail/app/routes.ts` only.
- CodeGraph was attempted before editing, but the MCP layer returned `user cancelled MCP tool call`, matching the inherited report's limitation.
- The suggested bare grep `grep -c '"queue"'` does not match React Router's pretty JSON because the route appears as `id: "(routes)/queue/page"` and `path: "/queue"`. I used the equivalent path check below.

Inherited work found: the queue route component, queue components/tests, sidebar/nav/message changes, and previous `queue-view-01.md` report were already present; I only added the missing route registration.

What I did:
- Added one line to `apps/mail/app/routes.ts` inside the existing `(routes)/layout.tsx` group, before the catch-all:
  `route('/queue', '(routes)/queue/page.tsx'),`

Route mount evidence:

- Command: `cd apps/mail && ./node_modules/.bin/react-router routes --json | grep -c '"path": "/queue"'`
  Executor: bash
  Exit code: 0
  Output:
  ```text
  1
  ```

Check evidence:

- RUN: `ls "apps/mail/app/(routes)/queue"`
  Executor: bash
  Exit code: 0
  Output:
  ```text
  page.tsx
  ```

- RUN: `ls apps/mail/components/queue`
  Executor: bash
  Exit code: 0
  Output:
  ```text
  queue-review.tsx
  queue-view-model.test.ts
  queue-view-model.ts
  ```

- RUN: `grep -rho "outbox" "apps/mail/app/(routes)/queue" apps/mail/components/queue | wc -l`
  Executor: bash
  Exit code: 0
  Output:
  ```text
        11
  ```

- RUN: `grep -c "queue" apps/mail/messages/en.json`
  Executor: bash
  Exit code: 0
  Output:
  ```text
  8
  ```

- RUN: `grep -c "queue" apps/mail/messages/fr.json`
  Executor: bash
  Exit code: 0
  Output:
  ```text
  4
  ```

- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 98 && echo TSC_NO_NEW_ERRORS`
  Executor: bash
  Exit code: 0
  Output:
  ```text
  TSC_NO_NEW_ERRORS
  ```

- RUN: `{ git diff --name-only base/tartine-wave2..HEAD -- apps/server; git status --porcelain -- apps/server; } | wc -l`
  Executor: bash
  Exit code: 0
  Output:
  ```text
         0
  ```

- RUN: `{ git diff --name-only base/tartine-wave2..HEAD -- "apps/mail/app/(routes)/mail" "apps/mail/app/(routes)/settings"; git status --porcelain -- "apps/mail/app/(routes)/mail" "apps/mail/app/(routes)/settings"; } | wc -l`
  Executor: bash
  Exit code: 0
  Output:
  ```text
         0
  ```

Quick sanity:

- Command attempted: `cd apps/mail && npx vitest run components/queue --reporter=basic`
  Executor: bash
  Exit code: 127
  Output:
  ```text
  sh: vitest: command not found
  ```

- Command used, matching the previous session's working path: `./node_modules/.pnpm/node_modules/.bin/vitest run apps/mail/components/queue/queue-view-model.test.ts --reporter=basic`
  Executor: bash
  Exit code: 0
  Output:
  ```text

   RUN  v3.2.4 /Users/thomasverdenne/cc/zero/.architect/wt/tartine/queue-view-01

   DEPRECATED  'basic' reporter is deprecated and will be removed in Vitest v3.
  Remove 'basic' from 'reporters' option. To match 'basic' reporter 100%, use configuration:
  {
    "test": {
      "reporters": [
        [
          "default",
          {
            "summary": false
          }
        ]
      ]
    }
  }
   ✓ apps/mail/components/queue/queue-view-model.test.ts (2 tests) 1ms


   Test Files  1 passed (1)
        Tests  2 passed (2)
     Start at  16:21:14
     Duration  166ms (transform 21ms, setup 0ms, collect 20ms, tests 1ms, environment 0ms, prepare 34ms)
  ```

Sandbox limitations / substitutions:
- CodeGraph MCP status call returned `user cancelled MCP tool call`, so I used direct reads for the one-line route registry inspection.
- The `apps/mail` `npx vitest` sanity command could not find `vitest`; I used the previous session's recorded root binary path instead.
- No Wrangler substitution was needed in this run because the frozen `npx tsc --noEmit` no-new-errors check completed successfully.
- `docs/checks/` was not modified.

STATUS: DONE — all frozen RUN checks pass locally
