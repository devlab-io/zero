# Checkrun: keyboard-test-dom-v14-checkrun

generated: 2026-07-14T15:24:30Z runner: sh config: .architect/checkrun-keyboard-test-dom-v14.json
check_file: docs/checks/niveau10/keyboard-runtime.md freeze_sha: 56e5caf40fb25c489fbe184a194f1ca5bb4cf39d
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=56e5caf40fb25c489fbe184a194f1ca5bb4cf39d
changed_files: 0 listed below; docs_checks_touched=false

## RUN line 9

$ pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
exit: 0 ms: 2332 bytes: 775

RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/mail

✓ components/mail/reply-recipients.test.ts (18 tests) 2ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser

✓ lib/hotkeys/keyboard-parity.test.ts (12 tests) 6ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser

✓ lib/hotkeys/keyboard-runtime.test.tsx (10 tests) 1282ms
✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+? 1270ms

Test Files 3 passed (3)
Tests 40 passed (40)
Start at 05:24:30
Duration 1.77s (transform 518ms, setup 0ms, collect 235ms, tests 1.29s, environment 598ms, prepare 128ms)

## RUN line 10

$ pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx components/queue/queue-review.tsx app/'(routes)'/settings/shortcuts
exit: 0 ms: 1639 bytes: 2349
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/mail/components/create/email-composer.tsx
217:9 warning The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 539) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook react-hooks/exhaustive-deps
396:9 warning The 'saveDraft' function makes the dependencies of useEffect Hook (at line 520) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook react-hooks/exhaustive-deps
458:9 warning The 'handleClose' function makes the dependencies of useEffect Hook (at line 479) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/mail/components/queue/queue-review.tsx
126:9 warning The 'items' logical expression could make the dependencies of useMemo Hook (at line 128) change on every render. To fix this, wrap the initialization of 'items' in its own useMemo() Hook react-hooks/exhaustive-deps
133:9 warning The 'visibleStatuses' conditional could make the dependencies of useMemo Hook (at line 136) change on every render. To fix this, wrap the initialization of 'visibleStatuses' in its own useMemo() Hook react-hooks/exhaustive-deps
260:5 warning React Hook useMemo has missing dependencies: 'approveItem', 'cancelItem', and 'openItem'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/mail/lib/hotkeys/mail-list-hotkeys.tsx
85:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps
197:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps

✖ 8 problems (0 errors, 8 warnings)

## RUN line 11

$ pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).\*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build
exit: 0 ms: 26544 bytes: 40882 truncated

> @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/server
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

> @zero/mail@0.1.0 types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/mail
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

(node:4124) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
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
Finished in 22ms on 362 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)

> @zero/mail@0.1.0 build /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/mail
> react-router build

✔ [paraglide-js] Compilation complete (message-modules)
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
(node:4560) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
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

## RUN line 12

$ git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/._|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/._|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'
exit: 0 ms: 48 bytes: 0

## RUN line 13

$ git diff --check
exit: 0 ms: 16 bytes: 0
