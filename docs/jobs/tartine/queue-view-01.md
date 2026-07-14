PHASE 0:

MIRROR: ORCHESTRATOR

Input verification:
- `git rev-parse HEAD` output: `ed4f9e8f3ab8b596206fdc8d26702e3096d49fbb`
- Read `docs/checks/tartine/queue-view.md` and `docs/spec/agent-draft-queue.md`; both present.
- Ran the required setup attempt before any tsc:
  - `pnpm install --offline --frozen-lockfile --ignore-scripts` passed.
  - `pnpm run types` in `apps/server` and `apps/mail` failed under sandbox because Wrangler tried to write logs under `/Users/thomasverdenne/Library/Preferences/.wrangler/logs/...` and bind `127.0.0.1` (`EPERM`, `listen EPERM`). Substitutions are recorded below.

Plan:
1. Build only the allowed `/queue` files and queue components.
2. Consume the existing `outbox` tRPC router from the mail app provider pattern.
3. Add grouped/filterable status view, approve/reject/open/retry actions, queue-scope d/r/a/f/h hotkeys, and 15 s approve undo via `cancel`.
4. Add sidebar queue entry and pending review badge without touching `NavMain`.
5. Add EN/FR source messages.
6. Run every frozen RUN command verbatim in bash and record evidence.

Disagreements / constraints checked:
- Route registration conflict: the acceptance asks for `/queue`, but `apps/mail/app/routes.ts` is the manual route registry and is outside MAY TOUCH. Evidence: `apps/mail/app/routes.ts:24-53` registers `/developer`, `/mail/**`, `/settings/**`, then catch-all not-found, with no `/queue`. I did not edit it. I also checked `cd apps/mail && ./node_modules/.bin/react-router routes --json | rg '"path":"/queue"|queue' || true`; output was empty, exit 0. Result: `apps/mail/app/(routes)/queue/page.tsx` exists but cannot be mounted without an out-of-bound edit.
- Sidebar badge constraint: `NavItem.badge` is not rendered by `apps/mail/components/ui/nav-main.tsx`; evidence `apps/mail/components/ui/nav-main.tsx:318-325` only renders counts from `useStats()` labels. Since `NavMain` is outside MAY TOUCH, I kept the count badge inside `app-sidebar.tsx` by wrapping the queue icon when `outbox.list({ status: "draft_ready" })` returns items.
- CodeGraph MCP was attempted and cancelled by the MCP layer twice (`codegraph_status`, `codegraph_files`). I used direct `rg`/file reads after that.

What I built:
- New queue route files under `apps/mail/app/(routes)/queue/` and `apps/mail/components/queue/`.
- `QueueReview` consumes `trpc.outbox.list.queryOptions({})`, groups all statuses (`queued`, `generating`, `draft_ready`, `approved`, `sending`, `sent`, `cancelled`, `failed`), and supports status filters.
- One-touch actions:
  - Approve: `outbox.approve`.
  - Reject: `outbox.cancel`.
  - Open: opens existing composer via `draftId` + `isComposeOpen=true` when `gmailDraftId` exists, otherwise opens the thread.
  - Retry: available for failed items.
- Queue keyboard scope with the existing shortcut helper model:
  - `d` / `a`: approve selected.
  - `r`: reject selected.
  - `f` / `h`: open selected.
- Post-approve undo countdown uses `scheduledSendAt`; undo calls `outbox.cancel`.
- Sidebar queue nav entry plus pending count badge for `draft_ready` items.
- EN/FR queue labels in `apps/mail/messages/en.json` and `apps/mail/messages/fr.json`.
- Added a small pure view-model helper and focused Vitest test for grouping/countdown behavior.

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

Additional local check:
- `./node_modules/.pnpm/node_modules/.bin/vitest run apps/mail/components/queue/queue-view-model.test.ts` passed: 2 tests, 1 file.

Sandbox limitations / substitutions:
- Exact `pnpm run types` failed in both `apps/server` and `apps/mail` due Wrangler log write and localhost bind sandbox restrictions:
  - `EPERM: operation not permitted, open '/Users/thomasverdenne/Library/Preferences/.wrangler/logs/...'`
  - `Error: listen EPERM: operation not permitted 127.0.0.1`
- `pnpm run types -- --include-runtime false` also hung through a pnpm self-bootstrap attempt, so I used the installed Wrangler binary directly:
  - `HOME=/private/tmp/wrangler-home XDG_CONFIG_HOME=/private/tmp/wrangler-home/.config ./node_modules/.pnpm/node_modules/.bin/wrangler types --cwd apps/server --env local --include-runtime false`
  - `HOME=/private/tmp/wrangler-home XDG_CONFIG_HOME=/private/tmp/wrangler-home/.config ./node_modules/.pnpm/node_modules/.bin/wrangler types --cwd apps/mail --include-runtime false`
- `apps/mail/.react-router` typegen was required to match the frozen tsc baseline; it is ignored by root `.gitignore`.
- Paraglide generation was required to match the frozen tsc baseline. `paraglide-js compile` emitted fetch warnings because network is restricted, but produced self-ignored `apps/mail/paraglide`. I generated a local ignored message shim from `apps/mail/messages/en.json` so tsc could resolve `m[...]` keys. This is a sandbox check artifact; tracked i18n source remains `apps/mail/messages/en.json` and `apps/mail/messages/fr.json`.
- CodeGraph MCP calls were cancelled by the MCP layer; direct repository reads were used.

STATUS: BLOCKED — `/queue` cannot be registered without editing `apps/mail/app/routes.ts`, which is outside MAY TOUCH; I built the allowed queue route/component/sidebar/message slice and all frozen RUN checks pass locally
