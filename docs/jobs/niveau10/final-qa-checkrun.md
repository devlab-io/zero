# Checkrun: final-qa-checkrun

generated: 2026-07-14T16:16:13Z runner: sh config: .architect/checkrun-final-qa-v18.json
check_file: docs/checks/niveau10/final-qa.md freeze_sha: c9fdc91f0c516d58910b00c722d84d46b1c93069
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=9f78f52624bae3046d18559f7a7a791ff5382c71
changed_files: 12 listed below; docs_checks_touched=false
apps/mail/app/(routes)/settings/shortcuts/contextual-shortcut-sheet.tsx
apps/mail/components/mail/reply-recipients.test.ts
apps/mail/components/mail/reply-recipients.ts
apps/mail/lib/hotkeys/use-hotkey-utils.ts
apps/server/src/lib/driver/google-drafts.test.ts
apps/server/src/routes/agent/mcp-account.test.ts
apps/server/src/routes/agent/mcp-account.ts
apps/server/src/routes/agent/mcp-auth.test.ts
apps/server/src/routes/agent/mcp-idempotency.test.ts
apps/server/src/routes/index.ts
docs/jobs/niveau10/final-qa-01.md
docs/jobs/niveau10/final-qa-checkrun.md

## RUN line 9

$ pnpm test
exit: 0 ms: 4528 bytes: 11402

> zero@0.1.0 test /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01
> turbo run test

turbo 2.5.6

• Packages in scope: @zero/cli, @zero/eslint-config, @zero/mail, @zero/server, @zero/testing, @zero/tsconfig, @zero/types
• Running test in 7 packages
• Remote caching disabled
@zero/mail:test: cache bypass, force executing efa1b73b16b424d1
@zero/server:test: cache bypass, force executing 76a4f623968bd3e8
@zero/mail:test:
@zero/mail:test: > @zero/mail@0.1.0 test /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail
@zero/mail:test: > vitest run
@zero/mail:test:
@zero/server:test:
@zero/server:test: > @zero/server@ test /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/server
@zero/server:test: > vitest run
@zero/server:test:
@zero/server:test:
@zero/server:test: RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/server
@zero/server:test:
@zero/mail:test:
@zero/mail:test: RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail
@zero/mail:test:
@zero/server:test: ✓ src/lib/driver/gmail-batch.test.ts (17 tests) 25ms
@zero/server:test: ✓ src/lib/driver/gmail-backoff.test.ts (17 tests) 7ms
@zero/server:test: ✓ src/lib/sentry.test.ts (5 tests) 13ms
@zero/server:test: ✓ src/lib/errors.test.ts (6 tests) 2ms
@zero/server:test: ✓ src/env-schema.boot.test.ts (19 tests) 5ms
@zero/server:test: ✓ src/routes/agent/mcp-idempotency.test.ts (3 tests) 12ms
@zero/server:test: ✓ src/trpc/routes/mail.test.ts (43 tests) 16ms
@zero/server:test: ✓ src/routes/agent/mcp-tools.test.ts (23 tests) 19ms
@zero/server:test: ✓ src/lib/mail-sanitize/index.test.ts (3 tests) 6ms
@zero/server:test: ✓ src/routes/agent/mcp-auth.test.ts (4 tests) 11ms
@zero/server:test: ✓ src/lib/driver/google-transport.test.ts (20 tests) 32ms
@zero/server:test: ✓ src/routes/agent/mcp-account.test.ts (2 tests) 3ms
@zero/server:test: ✓ src/lib/driver/driver-utils.test.ts (15 tests) 5ms
@zero/server:test: ✓ src/lib/driver/google-parse.test.ts (23 tests) 17ms
@zero/server:test: ✓ src/lib/driver/google-account.test.ts (8 tests) 4ms
@zero/server:test: ✓ src/env-schema.test.ts (6 tests) 4ms
@zero/server:test: ✓ src/lib/driver/google-messages.test.ts (9 tests) 6ms
@zero/server:test: ✓ src/lib/driver/google-threads.test.ts (21 tests) 15ms
@zero/server:test: ✓ src/lib/draft-outbox/state-machine.test.ts (4 tests) 3ms
@zero/server:test: ✓ src/lib/driver/google-drafts.test.ts (12 tests) 13ms
@zero/server:test: ✓ src/lib/driver/google-label-color-map.test.ts (8 tests) 3ms
@zero/server:test: ✓ src/lib/google-scopes.test.ts (5 tests) 4ms
@zero/server:test: ✓ src/lib/auth-providers.test.ts (7 tests) 3ms
@zero/server:test: ✓ src/lib/driver/gmail-sync-persist.test.ts (4 tests) 3ms
@zero/mail:test: ✓ lib/optimistic-recovery.test.ts (4 tests) 3ms
@zero/mail:test: ✓ lib/draft-storage.test.ts (7 tests) 3ms
@zero/mail:test: ✓ store/optimistic-updates.test.ts (6 tests) 5ms
@zero/mail:test: ✓ components/mail/label-move-picker.logic.test.ts (3 tests) 2ms
@zero/mail:test: ✓ workers/spa-fallback.test.ts (11 tests) 5ms
@zero/mail:test: ✓ components/mail/reply-recipients.test.ts (18 tests) 7ms
@zero/mail:test: ✓ lib/query-retry.test.ts (6 tests) 71ms
@zero/mail:test: stderr | components/mail/thread-triage.test.tsx
@zero/mail:test: KeyboardLayoutMap API is not supported in this browser
@zero/mail:test:
@zero/mail:test: stderr | lib/hotkeys/keyboard-parity.test.ts
@zero/mail:test: KeyboardLayoutMap API is not supported in this browser
@zero/mail:test:
@zero/mail:test: stderr | lib/hotkeys/keyboard-runtime.test.tsx
@zero/mail:test: KeyboardLayoutMap API is not supported in this browser
@zero/mail:test:
@zero/mail:test: stderr | hooks/use-optimistic-actions.test.ts > useOptimisticActions — markAsRead (silent = exécution directe) > chemin d’erreur (post-#34) : undo + réconciliation liste + toast.error avec action Retry
@zero/mail:test: Action failed: Error: net
@zero/mail:test: at /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/hooks/use-optimistic-actions.test.ts:149:68
@zero/mail:test: at file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
@zero/mail:test: at file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
@zero/mail:test: at file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
@zero/mail:test: at new Promise (<anonymous>)
@zero/mail:test: at runWithTimeout (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
@zero/mail:test: at runTest (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
@zero/mail:test: at runSuite (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
@zero/mail:test: at runSuite (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
@zero/mail:test: at runFiles (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1787:3)
@zero/mail:test:
@zero/mail:test: stderr | hooks/use-optimistic-actions.test.ts > useOptimisticActions — markAsRead (silent = exécution directe) > chemin d’erreur (post-#34) : undo + réconciliation liste + toast.error avec action Retry
@zero/mail:test: Action failed: Error: net
@zero/mail:test: at /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/hooks/use-optimistic-actions.test.ts:149:68
@zero/mail:test: at file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
@zero/mail:test: at file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
@zero/mail:test: at file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
@zero/mail:test: at new Promise (<anonymous>)
@zero/mail:test: at runWithTimeout (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
@zero/mail:test: at runTest (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
@zero/mail:test: at runSuite (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
@zero/mail:test: at runSuite (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
@zero/mail:test: at runFiles (file:///Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js:1787:3)
@zero/mail:test:
@zero/mail:test: stderr | components/context/command-palette-search.test.tsx
@zero/mail:test: KeyboardLayoutMap API is not supported in this browser
@zero/mail:test:
@zero/mail:test: ✓ components/icons/animated/icon-restart.test.tsx (3 tests) 20ms
@zero/mail:test: ✓ lib/hotkeys/keyboard-parity.test.ts (12 tests) 8ms
@zero/mail:test: ✓ hooks/use-optimistic-actions.test.ts (19 tests) 52ms
@zero/server:test: ✓ src/lib/driver/google-labels.test.ts (14 tests) 116ms
@zero/mail:test: ✓ components/create/send-and-archive.test.ts (4 tests) 2ms
@zero/mail:test: ✓ lib/optimistic-actions-manager.test.ts (4 tests) 2ms
@zero/mail:test: ✓ lib/mail-list-state.test.ts (6 tests) 3ms
@zero/mail:test: ✓ components/ui/animated-number.test.ts (5 tests) 2ms
@zero/mail:test: ✓ lib/composer-flush.test.ts (4 tests) 2ms
@zero/mail:test: stderr | components/queue/queue-review.test.tsx
@zero/mail:test: KeyboardLayoutMap API is not supported in this browser
@zero/mail:test:
@zero/mail:test: ✓ components/mail/mail-list-thread.test.ts (6 tests) 2ms
@zero/mail:test: ✓ components/queue/queue-review.test.tsx (4 tests) 2ms
@zero/mail:test: ✓ lib/thread-view-state.test.ts (6 tests) 2ms
@zero/mail:test: ✓ components/mail/thread-display.transition.test.ts (3 tests) 1ms
@zero/server:test: ✓ src/routes/agent/mcp-draft-loop.test.ts (17 tests) 154ms
@zero/mail:test: ✓ components/mail/mail-lazy-surfaces.test.tsx (5 tests) 19ms
@zero/mail:test: ✓ components/queue/queue-view-model.test.ts (2 tests) 1ms
@zero/mail:test: ✓ components/context/command-registry.test.ts (4 tests) 2ms
@zero/mail:test: ✓ components/context/command-palette-search.test.tsx (23 tests) 138ms
@zero/server:test: stdout | src/routes/agent/projection.test.ts > buildThreadProjection (#30 rich list projection) > serializes 50 rows well under the 120 KiB gzip budget
@zero/server:test: [#30] 50-row projection payload: raw=17959B gzip=1274B (budget 122880B)
@zero/server:test:
@zero/server:test: ✓ src/routes/agent/projection.test.ts (9 tests) 4ms
@zero/server:test:
@zero/server:test: Test Files 27 passed (27)
@zero/server:test: Tests 324 passed (324)
@zero/server:test: Start at 06:16:14
@zero/server:test: Duration 2.35s (transform 2.44s, setup 0ms, collect 9.53s, tests 505ms, environment 3ms, prepare 3.73s)
@zero/server:test:
@zero/mail:test: ✓ components/context/command-palette-context.test.tsx (6 tests) 23ms
@zero/mail:test: ✓ components/mail/ux-trust.test.tsx (6 tests) 9ms
@zero/mail:test: ✓ components/mail/thread-triage.test.tsx (6 tests) 4ms
@zero/mail:test: ✓ lib/hotkeys/keyboard-runtime.test.tsx (10 tests) 1742ms
@zero/mail:test: ✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+? 1723ms
@zero/mail:test: ✓ components/ui/app-sidebar.triggers.test.tsx (3 tests) 30ms
@zero/mail:test:
@zero/mail:test: Test Files 28 passed (28)
@zero/mail:test: Tests 196 passed (196)
@zero/mail:test: Start at 06:16:14
@zero/mail:test: Duration 3.18s (transform 2.17s, setup 0ms, collect 12.47s, tests 2.16s, environment 12.78s, prepare 2.95s)
@zero/mail:test:

Tasks: 2 successful, 2 total
Cached: 0 cached, 2 total
Time: 3.677s

## RUN line 10

$ git diff --name-only --diff-filter=ACMR bc3dab47...HEAD -- apps/mail apps/server docs/agent scripts/security | rg '\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|html|yml|yaml)$' | tr '\n' '\0' | xargs -0 pnpm exec prettier --check && pnpm --filter @zero/server exec eslint src/routes/index.ts src/lib/logger.ts src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/context/command-palette-search.test.tsx components/mail components/queue components/create/email-composer.tsx components/create/email-composer.fields.tsx components/create/create-email.tsx hooks/use-composer-draft-persistence.ts hooks/use-labels-search.ts hooks/use-mail-navigation.ts app/root.tsx app/'(routes)'/settings/shortcuts
exit: 0 ms: 4144 bytes: 6566
Checking formatting...
All matched files use Prettier code style!
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/create/email-composer.tsx
251:9 warning The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 670) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook react-hooks/exhaustive-deps
457:9 warning The 'saveDraft' function makes the dependencies of useEffect Hook (at line 651) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook react-hooks/exhaustive-deps
551:9 warning The 'handleClose' function makes the dependencies of useEffect Hook (at line 572) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/mail/mail-display.research.tsx
95:6 warning React Hook useCallback has missing dependencies: 'doSearch' and 'person.email'. Either include them or remove the dependency array react-hooks/exhaustive-deps
101:6 warning React Hook useEffect has a missing dependency: 'handleSearch'. Either include it or remove the dependency array react-hooks/exhaustive-deps
123:5 warning React Hook useCallback has a missing dependency: 'findSource'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/mail/mail-display.tsx
128:6 warning React Hook useEffect has missing dependencies: 'index' and 'totalEmails'. Either include them or remove the dependency array react-hooks/exhaustive-deps
244:5 warning React Hook useCallback has a missing dependency: 'handleCopySenderEmail'. Either include it or remove the dependency array react-hooks/exhaustive-deps
263:6 warning React Hook useMemo has a missing dependency: 'folder'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/mail/mail-list-draft.tsx
28:6 warning React Hook useCallback has missing dependencies: 'setComposeOpen' and 'setDraftId'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/mail/mail-list-thread.tsx
132:8 warning React Hook useMemo has a missing dependency: 'getThreadData?.latest?.body'. Either include it or remove the dependency array react-hooks/exhaustive-deps
441:6 warning React Hook useMemo has missing dependencies: 'cleanName', 'displayImportant', 'displayStarred', 'handleToggleImportant', 'handleToggleStar', 'hasDraft', 'index', 'isGroupThread', 'isKeyboardFocused', 'moveThreadTo', 'queryClient', 'setMail', and 'trpc.mail.get'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/mail/mail-list.tsx
118:7 warning React Hook useCallback has a missing dependency: 'setAnchorIndex'. Either include it or remove the dependency array react-hooks/exhaustive-deps
145:8 warning React Hook useEffect has a missing dependency: 'searchValue'. Either include it or remove the dependency array react-hooks/exhaustive-deps
187:7 warning React Hook useCallback has a missing dependency: 'Comp'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/mail/mail.tsx
349:6 warning React Hook useEffect has a missing dependency: 'navigate'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/components/queue/queue-review.tsx
135:9 warning The 'items' logical expression could make the dependencies of useMemo Hook (at line 137) change on every render. To fix this, wrap the initialization of 'items' in its own useMemo() Hook react-hooks/exhaustive-deps
142:9 warning The 'visibleStatuses' conditional could make the dependencies of useMemo Hook (at line 145) change on every render. To fix this, wrap the initialization of 'visibleStatuses' in its own useMemo() Hook react-hooks/exhaustive-deps
319:8 warning React Hook useMemo has missing dependencies: 'approveItem', 'cancelItem', and 'openItem'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/hooks/use-composer-draft-persistence.ts
33:5 warning React Hook useMemo has a missing dependency: 'scope'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/hooks/use-mail-navigation.ts
143:5 warning React Hook useCallback has a missing dependency: 'optimisticMarkAsRead'. Either include it or remove the dependency array react-hooks/exhaustive-deps
274:5 warning React Hook useCallback has an unnecessary dependency: 'setFocusedIndex'. Either exclude it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail/lib/hotkeys/mail-list-hotkeys.tsx
85:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps
197:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps

✖ 24 problems (0 errors, 24 warnings)

## RUN line 11

$ pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs
exit: 0 ms: 10902 bytes: 7470

> @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/server
> wrangler types --env local

⛅️ wrangler 4.32.0 (update available 4.110.0)
──────────────────────────────────────────────
Generating project types...

declare namespace Cloudflare {
interface Env {
gmail_history_id: KVNamespace;
gmail_processing_threads: KVNamespace;
subscribed_accounts: KVNamespace;
connection_labels: KVNamespace;
prompts_storage: KVNamespace;
gmail_sub_age: KVNamespace;
pending_emails_status: KVNamespace;
pending_emails_payload: KVNamespace;
scheduled_emails: KVNamespace;
snoozed_emails: KVNamespace;
NODE_ENV: "local" | "development" | "production";
COOKIE_DOMAIN: "localhost" | "devlab-tahiti.workers.dev";
VITE_PUBLIC_BACKEND_URL: "http://localhost:8787" | "https://zero-server-staging.devlab-tahiti.workers.dev" | "https://zero-server-production.devlab-tahiti.workers.dev";
VITE_PUBLIC_APP_URL: "http://localhost:3000" | "https://zero-staging.devlab-tahiti.workers.dev" | "https://zero-production.devlab-tahiti.workers.dev";
JWT_SECRET: "secret";
ELEVENLABS_API_KEY: "1234567890";
DISABLE_CALLS: "true" | "";
VOICE_SECRET: "1234567890";
GOOGLE_S_ACCOUNT: "{}";
DROP_AGENT_TABLES: "false";
THREAD_SYNC_MAX_COUNT: "60" | "2000";
THREAD_SYNC_LOOP: "false" | "true";
DISABLE_WORKFLOWS: "true" | "false";
AUTORAG_ID: "";
USE_OPENAI: "true";
CLOUDFLARE_ACCOUNT_ID: "";
CLOUDFLARE_API_TOKEN: "";
MEET_AUTH_HEADER: "";
OTEL_EXPORTER_OTLP_ENDPOINT: "https://api.axiom.co/v1/traces";
OTEL_SERVICE_NAME: "zero-email-server-local" | "zero-email-server-staging" | "zero-email-server-production";
DD_API_KEY: "";
DD_APP_KEY: "";
DD_SITE: "datadoghq.com";
FORCE_GOOGLE_AUTH: "true";
ZERO_AGENT: DurableObjectNamespace<import("./src/main").ZeroAgent>;
ZERO_MCP: DurableObjectNamespace<import("./src/main").ZeroMCP>;
ZERO_DB: DurableObjectNamespace<import("./src/main").ZeroDB>;
ZERO_DRIVER: DurableObjectNamespace<import("./src/main").ZeroDriver>;
THINKING_MCP: DurableObjectNamespace<import("./src/main").ThinkingMCP>;
WORKFLOW_RUNNER: DurableObjectNamespace<import("./src/main").WorkflowRunner>;
THREAD_SYNC_WORKER: DurableObjectNamespace<import("./src/main").ThreadSyncWorker>;
SHARD_REGISTRY: DurableObjectNamespace<import("./src/main").ShardRegistry>;
THREADS_BUCKET: R2Bucket;
thread_queue: Queue;
subscribe_queue: Queue;
send_email_queue: Queue;
VECTORIZE: VectorizeIndex;
VECTORIZE_MESSAGE: VectorizeIndex;
HYPERDRIVE: Hyperdrive;
AI: Ai;
SYNC_THREADS_WORKFLOW: Workflow;
SYNC_THREADS_COORDINATOR_WORKFLOW: Workflow;
}
}
interface Env extends Cloudflare.Env {}
type StringifyValues<EnvType extends Record<string, unknown>> = {
[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};
declare namespace NodeJS {
interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, "NODE_ENV" | "COOKIE_DOMAIN" | "VITE_PUBLIC_BACKEND_URL" | "VITE_PUBLIC_APP_URL" | "JWT_SECRET" | "ELEVENLABS_API_KEY" | "DISABLE_CALLS" | "VOICE_SECRET" | "GOOGLE_S_ACCOUNT" | "DROP_AGENT_TABLES" | "THREAD_SYNC_MAX_COUNT" | "THREAD_SYNC_LOOP" | "DISABLE_WORKFLOWS" | "AUTORAG_ID" | "USE_OPENAI" | "CLOUDFLARE_ACCOUNT_ID" | "CLOUDFLARE_API_TOKEN" | "MEET_AUTH_HEADER" | "OTEL_EXPORTER_OTLP_ENDPOINT" | "OTEL_SERVICE_NAME" | "DD_API_KEY" | "DD_APP_KEY" | "DD_SITE" | "FORCE_GOOGLE_AUTH">> {}
}
declare module "\*.sql" {
const value: string;
export default value;
}
Generating runtime types...

Runtime types generated.

✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.

> @zero/mail@0.1.0 types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail
> wrangler types

⛅️ wrangler 4.32.0 (update available 4.110.0)
──────────────────────────────────────────────
Generating project types...

declare namespace Cloudflare {
interface Env {
VITE_PUBLIC_BACKEND_URL: "http://localhost:8787" | "https://zero-server-staging.devlab-tahiti.workers.dev" | "https://zero-server-production.devlab-tahiti.workers.dev";
VITE_PUBLIC_APP_URL: "http://localhost:3000" | "https://zero-staging.devlab-tahiti.workers.dev" | "https://zero-production.devlab-tahiti.workers.dev";
ASSETS: Fetcher;
}
}
interface Env extends Cloudflare.Env {}

Generating runtime types...

Runtime types generated.

✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.

(node:1190) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '\_'.[0m
╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
[2m34[0m │
[2m35[0m │ function onSubmit(values: z.infer<typeof formSchema>) {
· [38;2;246;87;248m ───┬──[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
[2m36[0m │ setIsSaving(true);
╰────
[38;2;106;159;181m help: [0mConsider removing this parameter.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useState' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:10]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬───[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useState' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useEffect' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:20]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬────[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useEffect' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

Found 3 warnings and 0 errors.
Finished in 20ms on 366 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
server: 0 errors (baseline 0)
mail: 0 errors (baseline 0)
typecheck-report OK — no regression above baseline.

## RUN line 12

$ pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build
exit: 0 ms: 20503 bytes: 33789 truncated
✔ [paraglide-js] Compilation complete (message-modules)
(node:1722) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

> @zero/mail@0.1.0 build /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/final-qa-01/apps/mail
> react-router build

✔ [paraglide-js] Compilation complete (message-modules)
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
(node:1946) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '\_'.[0m
╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
[2m34[0m │
[2m35[0m │ function onSubmit(values: z.infer<typeof formSchema>) {
· [38;2;246;87;248m ───┬──[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
[2m36[0m │ setIsSaving(true);
╰────
[38;2;106;159;181m help: [0mConsider removing this parameter.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useState' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:10]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬───[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useState' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useEffect' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:20]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬────[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useEffect' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

Found 3 warnings and 0 errors.
Finished in 11ms on 366 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
transforming...
(node:2001) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useState' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:10]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬───[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useState' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useEffect' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:20]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬────[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useEffect' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '\_'.[0m
╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
[2m34[0m │
[2m35[0m │ function onSubmit(values: z.infer<typeof formSchema>) {
· [38;2;246;87;248m ───┬──[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
[2m36[0m │ setIsSaving(true);
╰────
[38;2;106;159;181m help: [0mConsider removing this parameter.

Found 3 warnings and 0 errors.
Finished in 11ms on 366 files using 18 threads.

Oxlint successfully finished.
components/ui/recipient-autosuggest.tsx (1:0): Error when using sourcemap for reporting an error: Can't resolve original location of error.
✓ 5560 modules transformed.
rendering chunks...
[esbuild css minify]
▲ [WARNING] Unexpected ")" [css-syntax-error]

    <stdin>:2:187948:
      2 │ ...ͼo.cm-content::selection:where(){background-color:var(--color-z...
        ╵                                   ^

computing gzip size...
build/client/_headers 0.10 kB
build/client/assets/geist-mono-cyrillic-wght-normal-BZdD_g9V.woff2 12.62 kB
build/client/assets/geist-mono-latin-ext-wght-normal-b6lpi8_2.woff2 13.04 kB
build/client/assets/geist-cyrillic-wght-normal-CHSlOQsW.woff2 14.69 kB
build/client/assets/geist-latin-ext-wght-normal-DMtmJ5ZE.woff2 15.31 kB
build/client/assets/geist-latin-wght-normal-Dg_dQHbK.woff2 28.40 kB
build/client/assets/geist-mono-latin-wght-normal-Cjtb1TV-.woff2 31.37 kB
build/client/.vite/manifest.json 113.88 kB │ gzip: 10.79 kB
build/client/assets/github-emojis-BZo2opiZ.json 480.05 kB │ gzip: 54.52 kB
build/client/assets/use-compose-editor-BGP8UyxO.css 1.18 kB │ gzip: 0.54 kB
build/client/assets/create-email-BPBxLlBr.css 2.85 kB │ gzip: 1.08 kB
build/client/assets/root-Cvxuc0qQ.css 196.04 kB │ gzip: 31.45 kB
build/client/assets/index-BdQq_4o_.js 0.06 kB │ gzip: 0.08 kB
build/client/assets/page-DjhY2S-i.js 0.09 kB │ gzip: 0.10 kB
build/client/assets/log-C2ehuyFy.js 0.12 kB │ gzip: 0.09 kB
build/client/assets/navigation*settings_categories-\_QaZskh4.js 0.14 kB │ gzip: 0.14 kB
build/client/assets/page-CRxdzZs4.js 0.14 kB │ gzip: 0.15 kB
build/client/assets/index-BOfZnf6N.js 0.14 kB │ gzip: 0.14 kB
build/client/assets/states_retry-zCBh0w8H.js 0.14 kB │ gzip: 0.15 kB
build/client/assets/common_actions_saving-CanPWJE8.js 0.15 kB │ gzip: 0.15 kB
build/client/assets/common_actions_savechanges1-CckwYdQ3.js 0.17 kB │ gzip: 0.16 kB
build/client/assets/not-found-CnTdy4AI.js 0.21 kB │ gzip: 0.19 kB
build/client/assets/index-CqHKcKqA.js 0.23 kB │ gzip: 0.17 kB
build/client/assets/\_commonjs-dynamic-modules-TDtrdbi3.js 0.24 kB │ gzip: 0.19 kB
build/client/assets/layout-DXjLd6QY.js 0.26 kB │ gzip: 0.22 kB
build/client/assets/constants-ydyuGGyp.js 0.28 kB │ gzip: 0.24 kB
build/client/assets/common_labels_deletelabelsuccess2-sHCnk1h0.js 0.29 kB │ gzip: 0.22 kB
build/client/assets/common_settings_failedtosave2-D2JnZA2b.js 0.30 kB │ gzip: 0.23 kB
build/client/assets/check-7PyOgxMn.js 0.30 kB │ gzip: 0.25 kB
build/client/assets/chevron-down-DGR_ozeI.js 0.31 kB │ gzip: 0.25 kB
build/client/assets/chevron-right-Da6m2C-L.js 0.31 kB │ gzip: 0.25 kB
build/client/assets/moon-CBLwVqNp.js 0.33 kB │ gzip: 0.26 kB
build/client/assets/loader-circle-CFAgBoIZ.js 0.33 kB │ gzip: 0.27 kB
build/client/assets/use-do-state-CynilHAK.js 0.34 kB │ gzip: 0.20 kB
build/client/assets/plus-cpt2mBdw.js 0.34 kB │ gzip: 0.26 kB
build/client/assets/use-email-aliases-CL5PPPXw.js 0.34 kB │ gzip: 0.24 kB
build/client/assets/x-DYcxNdnZ.js 0.34 kB │ gzip: 0.26 kB
build/client/assets/arrow-left-CCA8PmXq.js 0.35 kB │ gzip: 0.27 kB
build/client/assets/arrow-right-CYTbT5jq.js 0.35 kB │ gzip: 0.27 kB
build/client/assets/clock-CUDZhQQX.js 0.36 kB │ gzip: 0.28 kB
build/client/assets/use-move-to-IAcnyvJB.js 0.36 kB │ gzip: 0.28 kB
build/client/assets/message-square-DbOijJ6-.js 0.36 kB │ gzip: 0.28 kB
build/client/assets/command-B8Adkaxa.js 0.37 kB │ gzip: 0.27 kB
build/client/assets/rotate-ccw-CxQNnslt.js 0.38 kB │ gzip: 0.29 kB
build/client/assets/info-WQs_HAcz.js 0.38 kB │ gzip: 0.29 kB
build/client/assets/skeleton-e_m2WkhC.js 0.39 kB │ gzip: 0.29 kB
build/client/assets/undo-2-DVwHmqCa.js 0.39 kB │ gzip: 0.29 kB
build/client/assets/mail-WxVkr0XE.js 0.39 kB │ gzip: 0.31 kB
build/client/assets/index-BQdIXgaw.js 0.40 kB │ gzip: 0.31 kB
build/client/assets/trash-DfjO8EER.js 0.42 kB │ gzip: 0.31 kB
build/client/assets/use-settings-CiGi_5We.js 0.43 kB │ gzip: 0.29 kB
build/client/assets/circle-alert-BJZItTLt.js 0.43 kB │ gzip: 0.30 kB
build/client/assets/external-link-CMjd4WD1.js 0.43 kB │ gzip: 0.31 kB
build/client/assets/common_labels_savelabelsuccess2-BTeuKkp9.js 0.44 kB │ gzip: 0.27 kB
build/client/assets/triangle-alert-D4Bwmu8Z.js 0.45 kB │ gzip: 0.32 kB
build/client/assets/users-B_MkLaRx.js 0.49 kB │ gzip: 0.33 kB
build/client/assets/page-8xSmqHo2.js 0.50 kB │ gzip: 0.34 kB
build/client/assets/refresh-ccw-D2SN4DoO.js 0.50 kB │ gzip: 0.33 kB
build/client/assets/tag-Da65ZYyA.js 0.51 kB │ gzip: 0.35 kB
build/client/assets/file-text-DfFGgT_S.js 0.52 kB │ gzip: 0.33 kB
build/client/assets/trash-2-D5Ofj2bH.js 0.54 kB │ gzip: 0.36 kB
build/client/assets/index-D51KwZMQ.js 0.54 kB │ gzip: 0.35 kB
build/client/assets/use-connections-BwSvH891.js 0.58 kB │ gzip: 0.31 kB
build/client/assets/github-BD49PJuS.js 0.59 kB │ gzip: 0.40 kB
build/client/assets/auth-proxy-CRmQXmyv.js 0.60 kB │ gzip: 0.39 kB
build/client/assets/pixelated-bg-BsLVmHQN.js 0.65 kB │ gzip: 0.27 kB
build/client/assets/sidebar-toggle-miRcHkVm.js 0.65 kB │ gzip: 0.44 kB
build/client/assets/star-CGGujS8Y.js 0.66 kB │ gzip: 0.41 kB
build/client/assets/use-labels-search-BwSObGSb.js 0.79 kB │ gzip: 0.49 kB
build/client/assets/use-categories-By0vIUjJ.js 0.80 kB │ gzip: 0.46 kB
build/client/assets/label-DBCp0lco.js 0.80 kB │ gzip: 0.52 kB
build/client/assets/input-BmWx3iMJ.js 0.86 kB │ gzip: 0.52 kB
build/client/assets/settings-6ewCrjQh.js 0.91 kB │ gzip: 0.45 kB
build/client/assets/use-drafts-CL9PUEXX.js 0.92 kB │ gzip: 0.57 kB
build/client/assets/use-copy-to-clipboard-lw5sBjv8.js 0.98 kB │ gzip: 0.66 kB
build/client/assets/subDays-DJeyODh6.js 1.06 kB │ gzip: 0.55 kB
build/client/assets/separator-CaddfmOc.js 1.06 kB │ gzip: 0.61 kB
build/client/assets/preload-helper-BlTxHScW.js 1.11 kB │ gzip: 0.65 kB
build/client/assets/switch-pIYKbMGn.js 1.20 kB │ gzip: 0.67 kB
build/client/assets/runtime-DiQkvVRJ.js 1.20 kB │ gzip: 0.70 kB
build/client/assets/badge-8PUq1vFy.js 1.21 kB │ gzip: 0.61 kB
build/client/assets/index-Cpau4msV.js 1.24 kB │ gzip: 0.62 kB
build/client/assets/settings-card-B_TnpkUk.js 1.31 kB │ gzip: 0.75 kB
build/client/assets/page-BgwuXhg0.js 1.32 kB │ gzip: 0.67 kB
build/client/assets/use-labels-BJaQdlVY.js 1.57 kB │ gzip: 0.83 kB
build/client/assets/createLucideIcon-DKy5l81f.js 1.58 kB │ gzip: 0.66 kB
build/client/assets/loading-context-wOKjTvas.js 1.58 kB │ gzip: 0.91 kB
build/client/assets/page-Bt3AxGkT.js 1.59 kB │ gzip: 0.83 kB
build/client/assets/sidebar-context-DWB3JHSu.js 1.61 kB │ gzip: 0.93 kB
build/client/assets/zod-resolver-ClBnPcf*.js 1.65 kB │ gzip: 0.81 kB
build/client/assets/sun-BDcOhFok.js 1.80 kB │ gzip: 1.02 kB
build/client/assets/auth-client-ToExOC8i.js 1.82 kB │ gzip: 1.05 kB
build/client/assets/schemas-CT8TRZmU.js 1.88 kB │ gzip: 0.89 kB
build/client/assets/useMutation-rpOyklD4.js 2.07 kB │ gzip: 0.90 kB
build/client/assets/card-B_3Fhpx5.js 2.25 kB │ gzip: 0.53 kB
build/client/assets/button-BweEGwBh.js 2.28 kB │ gzip: 1.14 kB
build/client/assets/page-CWsSh_U8.js 2.31 kB │ gzip: 1.24 kB
build/client/assets/schemas-Q4l3B_lz.js 2.83 kB │ gzip: 1.37 kB
build/client/assets/page-CrokhJVX.js 2.85 kB │ gzip: 1.23 kB
build/client/assets/pricing-switch-CGLetn8-.js 3.01 kB │ gzip: 1.50 kB
build/client/assets/layout-BHtmFRTg.js 3.04 kB │ gzip: 1.39 kB
build/client/assets/page-B55zaYEF.js 3.07 kB │ gzip: 1.39 kB
build/client/assets/dialog-uDUdatss.js 3.20 kB │ gzip: 1.23 kB
build/client/assets/index-DRf8HITX.js 3.27 kB │ gzip: 1.49 kB
build/client/assets/form-BKdYqSsN.js 3.43 kB │ gzip: 1.42 kB
build/client/assets/navigation-BDBAG69H.js 3.44 kB │ gzip: 1.29 kB
build/client/assets/sheet-BBnLfK9z.js 3.46 kB │ gzip: 1.35 kB
build/client/assets/mailto-handler-Bjxtk3X2.js 3.46 kB │ gzip: 1.54 kB
build/client/assets/page-2q4Se91N.js 3.46 kB │ gzip: 1.61 kB
build/client/assets/use-mail-navigation-Dsm6tdPU.js 3.50 kB │ gzip: 1.50 kB
build/client/assets/index-jrGUJq7r.js 3.59 kB │ gzip: 1.62 kB
build/client/assets/tabs-BoR9CHWZ.js 3.95 kB │ gzip: 1.52 kB
build/client/assets/avatar-DkgEHQDJ.js 3.97 kB │ gzip: 1.67 kB
build/client/assets/pages_settings_shortcuts_actions_remind-Bx58UaId.js 3.99 kB │ gzip: 1.40 kB
build/client/assets/layout-BJecS0Xm.js 4.08 kB │ gzip: 1.84 kB
build/client/assets/chunk-YOMNTOJZ-BxpNjYiW.js 4.15 kB │ gzip: 1.48 kB
build/client/assets/page-Dy1liLV8.js 4.27 kB │ gzip: 2.00 kB
build/client/assets/use-threads-B9zVs84I.js 4.31 kB │ gzip: 1.94 kB
build/client/assets/thread-display.animated-message-list-DoMPVPe2.js 4.32 kB │ gzip: 1.98 kB
build/client/assets/page-IZ6HN6OD.js 4.41 kB │ gzip: 2.07 kB
build/client/assets/page-k-x2zaof.js 4.52 kB │ gzip: 1.94 kB
build/client/assets/use-billing-Bz4A3HnK.js 5.05 kB │ gzip: 1.96 kB

## RUN line 13

$ pnpm --filter @zero/server exec wrangler deploy --dry-run --env local --outdir .architect/tmp/niveau10-server-dryrun
exit: 0 ms: 2680 bytes: 5773

⛅️ wrangler 4.32.0 (update available 4.110.0)
──────────────────────────────────────────────
Total Upload: 21933.42 KiB / gzip: 2753.74 KiB
Your Worker has access to the following bindings:
Binding Resource
env.ZERO_AGENT (ZeroAgent) Durable Object
env.ZERO_MCP (ZeroMCP) Durable Object
env.ZERO_DB (ZeroDB) Durable Object
env.ZERO_DRIVER (ZeroDriver) Durable Object
env.THINKING_MCP (ThinkingMCP) Durable Object
env.WORKFLOW_RUNNER (WorkflowRunner) Durable Object
env.THREAD_SYNC_WORKER (ThreadSyncWorker) Durable Object
env.SHARD_REGISTRY (ShardRegistry) Durable Object
env.SYNC_THREADS_WORKFLOW (SyncThreadsWorkflow) Workflow
env.SYNC_THREADS_COORDINATOR_WORKFLOW (SyncThreadsCoordinatorWorkflow) Workflow
env.gmail_history_id (4e814c70e35d413d99c923029928efae) KV Namespace
env.gmail_processing_threads (b7db3a98a80f4e16a8b6edc5fa8c7b76) KV Namespace
env.subscribed_accounts (7e6eadacf19c4c56a9ec3c357adb584a) KV Namespace
env.connection_labels (4d3a28d3265a4388aae2e9e9b534d019) KV Namespace
env.prompts_storage (620e710aaea744e59df4788f9ec18ff9) KV Namespace
env.gmail_sub_age (c55e692bb71d4e5bae23dded092b09d5) KV Namespace
env.pending_emails_status (7f277903ebab4b4d89f5d59b1f531073) KV Namespace
env.pending_emails_payload (d5da698931524da9992fe398e095fc32) KV Namespace
env.scheduled_emails (444cad0e54114635b5199ffae9542bd5) KV Namespace
env.snoozed_emails (f3a30ed7198542d890db172536bade33) KV Namespace
env.thread_queue (thread-queue) Queue
env.subscribe_queue (subscribe-queue) Queue
env.send_email_queue (send-email-queue) Queue
env.VECTORIZE (threads-vector-staging) Vectorize Index
env.VECTORIZE_MESSAGE (messages-vector-staging) Vectorize Index
env.HYPERDRIVE (57834ddb6716440496c8836f6d99bc9a) Hyperdrive Config
env.THREADS_BUCKET (threads-staging) R2 Bucket
env.AI AI
env.NODE_ENV ("local") Environment Variable
env.COOKIE_DOMAIN ("localhost") Environment Variable
env.VITE_PUBLIC_BACKEND_URL ("http://localhost:8787") Environment Variable
env.VITE_PUBLIC_APP_URL ("http://localhost:3000") Environment Variable
env.JWT_SECRET ("secret") Environment Variable
env.ELEVENLABS_API_KEY ("1234567890") Environment Variable
env.DISABLE_CALLS ("true") Environment Variable
env.VOICE_SECRET ("1234567890") Environment Variable
env.GOOGLE_S_ACCOUNT ("{}") Environment Variable
env.DROP_AGENT_TABLES ("false") Environment Variable
env.THREAD_SYNC_MAX_COUNT ("60") Environment Variable
env.THREAD_SYNC_LOOP ("false") Environment Variable
env.DISABLE_WORKFLOWS ("true") Environment Variable
env.AUTORAG_ID ("") Environment Variable
env.USE_OPENAI ("true") Environment Variable
env.CLOUDFLARE_ACCOUNT_ID ("") Environment Variable
env.CLOUDFLARE_API_TOKEN ("") Environment Variable
env.MEET_AUTH_HEADER ("") Environment Variable
env.OTEL_EXPORTER_OTLP_ENDPOINT ("https://api.axiom.co/v1/traces") Environment Variable
env.OTEL_SERVICE_NAME ("zero-email-server-local") Environment Variable
env.DD_API_KEY ("") Environment Variable
env.DD_APP_KEY ("") Environment Variable
env.DD_SITE ("datadoghq.com") Environment Variable

--dry-run: exiting now.

## RUN line 14

$ node scripts/security/check-agent-surface.mjs
exit: 0 ms: 29 bytes: 84
Security surface check passed: least scopes, bounded session cache, draft-only MCP.

## RUN line 15

$ git diff --check
exit: 0 ms: 18 bytes: 0
