# Checkrun: ux-trust-v17-checkrun

generated: 2026-07-14T15:49:53Z runner: sh config: .architect/checkrun-ux-trust-v15.json
check_file: docs/checks/niveau10/ux-trust.md freeze_sha: 22a7c056ea929048789d5f924ce200b374cfbadd
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=01559ffc2d7a8efa7882fa4dbfaf5d6b6360cced
changed_files: 25 listed below; docs_checks_touched=false
apps/mail/app/root.tsx
apps/mail/components/create/create-email.tsx
apps/mail/components/create/email-composer.fields.tsx
apps/mail/components/create/email-composer.tsx
apps/mail/components/mail/composer-trust.ts
apps/mail/components/mail/mail-content.tsx
apps/mail/components/mail/mail-list-thread-actions.tsx
apps/mail/components/mail/mail-list-thread-projection.ts
apps/mail/components/mail/mail-list-thread.test.ts
apps/mail/components/mail/mail-list-thread.tsx
apps/mail/components/mail/mail-list.tsx
apps/mail/components/mail/mail-skeleton.tsx
apps/mail/components/mail/reply-composer.tsx
apps/mail/components/mail/select-all-checkbox.tsx
apps/mail/components/mail/snooze-dialog.tsx
apps/mail/components/mail/thread-display.empty-state.tsx
apps/mail/components/mail/thread-display.message-list.tsx
apps/mail/components/mail/thread-display.tsx
apps/mail/components/mail/ux-trust.test.tsx
apps/mail/components/queue/queue-review.logic.ts
apps/mail/components/queue/queue-review.test.tsx
apps/mail/components/queue/queue-review.tsx
apps/mail/hooks/use-composer-draft-persistence.ts
apps/mail/messages/en.json
apps/mail/messages/fr.json

## RUN line 9

$ pnpm --filter @zero/mail exec vitest run components/mail/ux-trust.test.tsx components/mail/mail-list-thread.test.ts components/queue/queue-review.test.tsx
exit: 0 ms: 1699 bytes: 561

RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail

✓ components/mail/mail-list-thread.test.ts (6 tests) 2ms
stderr | components/queue/queue-review.test.tsx
KeyboardLayoutMap API is not supported in this browser

✓ components/queue/queue-review.test.tsx (4 tests) 2ms
✓ components/mail/ux-trust.test.tsx (6 tests) 9ms

Test Files 3 passed (3)
Tests 16 passed (16)
Start at 05:49:53
Duration 1.18s (transform 166ms, setup 0ms, collect 943ms, tests 13ms, environment 432ms, prepare 116ms)

## RUN line 10

$ pnpm --filter @zero/mail exec eslint components/mail components/queue components/create/email-composer.tsx components/create/email-composer.fields.tsx components/create/create-email.tsx hooks/use-composer-draft-persistence.ts app/root.tsx app/'(routes)'/settings/shortcuts
exit: 0 ms: 1861 bytes: 5477
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/create/email-composer.tsx
251:9 warning The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 673) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook react-hooks/exhaustive-deps
457:9 warning The 'saveDraft' function makes the dependencies of useEffect Hook (at line 654) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook react-hooks/exhaustive-deps
554:9 warning The 'handleClose' function makes the dependencies of useEffect Hook (at line 575) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/mail/mail-display.research.tsx
95:6 warning React Hook useCallback has missing dependencies: 'doSearch' and 'person.email'. Either include them or remove the dependency array react-hooks/exhaustive-deps
101:6 warning React Hook useEffect has a missing dependency: 'handleSearch'. Either include it or remove the dependency array react-hooks/exhaustive-deps
123:5 warning React Hook useCallback has a missing dependency: 'findSource'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/mail/mail-display.tsx
128:6 warning React Hook useEffect has missing dependencies: 'index' and 'totalEmails'. Either include them or remove the dependency array react-hooks/exhaustive-deps
244:5 warning React Hook useCallback has a missing dependency: 'handleCopySenderEmail'. Either include it or remove the dependency array react-hooks/exhaustive-deps
263:6 warning React Hook useMemo has a missing dependency: 'folder'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/mail/mail-list-draft.tsx
28:6 warning React Hook useCallback has missing dependencies: 'setComposeOpen' and 'setDraftId'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/mail/mail-list-thread.tsx
132:8 warning React Hook useMemo has a missing dependency: 'getThreadData?.latest?.body'. Either include it or remove the dependency array react-hooks/exhaustive-deps
441:6 warning React Hook useMemo has missing dependencies: 'cleanName', 'displayImportant', 'displayStarred', 'handleToggleImportant', 'handleToggleStar', 'hasDraft', 'index', 'isGroupThread', 'isKeyboardFocused', 'moveThreadTo', 'queryClient', 'setMail', and 'trpc.mail.get'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/mail/mail-list.tsx
118:7 warning React Hook useCallback has a missing dependency: 'setAnchorIndex'. Either include it or remove the dependency array react-hooks/exhaustive-deps
145:8 warning React Hook useEffect has a missing dependency: 'searchValue'. Either include it or remove the dependency array react-hooks/exhaustive-deps
187:7 warning React Hook useCallback has a missing dependency: 'Comp'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/mail/mail.tsx
349:6 warning React Hook useEffect has a missing dependency: 'navigate'. Either include it or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/components/queue/queue-review.tsx
135:9 warning The 'items' logical expression could make the dependencies of useMemo Hook (at line 137) change on every render. To fix this, wrap the initialization of 'items' in its own useMemo() Hook react-hooks/exhaustive-deps
142:9 warning The 'visibleStatuses' conditional could make the dependencies of useMemo Hook (at line 145) change on every render. To fix this, wrap the initialization of 'visibleStatuses' in its own useMemo() Hook react-hooks/exhaustive-deps
319:8 warning React Hook useMemo has missing dependencies: 'approveItem', 'cancelItem', and 'openItem'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail/hooks/use-composer-draft-persistence.ts
33:5 warning React Hook useMemo has a missing dependency: 'scope'. Either include it or remove the dependency array react-hooks/exhaustive-deps

✖ 20 problems (0 errors, 20 warnings)

## RUN line 11

$ pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs
exit: 0 ms: 8452 bytes: 5199

> @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/server
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

> @zero/mail@0.1.0 types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail
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

✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
server: 0 errors (baseline 0)
mail: 0 errors (baseline 0)
typecheck-report OK — no regression above baseline.

## RUN line 12

$ pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build
exit: 0 ms: 21822 bytes: 33562 truncated
✔ [paraglide-js] Compilation complete (message-modules)

> @zero/mail@0.1.0 build /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/ux-trust-01/apps/mail
> react-router build

✔ [paraglide-js] Compilation complete (message-modules)
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
(node:20387) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
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
Finished in 12ms on 366 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
(node:20400) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
transforming...

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
build/client/assets/navigation_settings_categories-\_QaZskh4.js 0.14 kB │ gzip: 0.14 kB
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

## RUN line 13

$ git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(app\/root\.tsx|components\/mail\/._|components\/queue\/._|components\/create\/(email-composer\.tsx|email-composer\.fields\.tsx|create-email\.tsx)|hooks\/use-composer-draft-persistence\.ts|app\/\(routes\)\/settings\/shortcuts\/._|messages\/._)|docs\/jobs\/niveau10\/ux-trust-01\.md)$/ {print; bad=1} END {exit bad}'
exit: 0 ms: 29 bytes: 0

## RUN line 14

$ git diff -U0 -- apps/mail | grep -E '^\+.\*transition-all' && exit 1 || exit 0
exit: 0 ms: 17 bytes: 0

## RUN line 15

$ git diff --check
exit: 0 ms: 14 bytes: 0
