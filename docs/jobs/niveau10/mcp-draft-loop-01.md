# MCP draft-loop — builder 3 corrective evidence

MIRROR: BUILDER

BASELINE: 132b50d6 Merge branch 'factory/niveau10' into job/niveau10/mcp-draft-loop-01
RULING: docs/jobs/niveau10/mcp-draft-loop-rulings.md
SCOPE: corrected frozen check only; spec/check files unchanged; no commit or push

## Builder 3 provider-normalization correction

- updateDraft now compares the requested and refetched bodies through the existing
  sanitizeMailContent semantic representation instead of byte-for-byte provider HTML.
- The post-mutation proof still requires the exact same provider draft ID and now also
  requires a revision different from the precondition revision.
- The behavioral fake can apply the real sanitizeTipTapHtml renderer before every
  refetch. Its create -> get -> update cycle returns a full normalized HTML document,
  preserves the draft ID, changes the revision, and records zero send effects.
- Stale-revision zero-mutation, ownership indistinguishability, 20-way atomic
  idempotency, Gmail/Outlook seams, draft-only registration, and forbidden-tool absence
  remain covered by the same focused suite.

## Builder 3 frozen commands

FROZEN_COMMAND: pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts src/routes/agent/mcp-tools.test.ts
EXIT: 0
OUTPUT_BEGIN

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

 ✓ src/routes/agent/mcp-tools.test.ts (23 tests) 12ms
 ✓ src/routes/agent/mcp-draft-loop.test.ts (10 tests) 54ms

 Test Files  2 passed (2)
      Tests  33 passed (33)
   Start at  03:30:37
   Duration  722ms (transform 118ms, setup 0ms, collect 577ms, tests 66ms, environment 0ms, prepare 95ms)

OUTPUT_END

FROZEN_COMMAND: node scripts/security/check-agent-surface.mjs
EXIT: 0
OUTPUT_BEGIN
Security surface check passed: least scopes, bounded session cache, draft-only MCP.
OUTPUT_END

FROZEN_COMMAND: pnpm --filter @zero/server exec eslint src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm exec prettier apps/server/src/lib/driver/microsoft.ts docs/agent --check
EXIT: 0
OUTPUT_BEGIN
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
Checking formatting...
All matched files use Prettier code style!
OUTPUT_END

FROZEN_COMMAND: pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit
EXIT: 0
OUTPUT_BEGIN

> @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server
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
declare module "*.sql" {
	const value: string;
	export default value;
}
Generating runtime types...

Runtime types generated.


✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.

OUTPUT_END

FROZEN_COMMAND: git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/src\/(routes\/agent\/mcp[^\/]*\.ts|lib\/driver\/.*)|docs\/agent\/.*|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-draft-loop-01\.md)$/ {print; bad=1} END {exit bad}'
EXIT: 0
OUTPUT_BEGIN
OUTPUT_END

FROZEN_COMMAND: git diff --check
EXIT: 0
OUTPUT_BEGIN
OUTPUT_END

COUNTS: frozen_commands=6 frozen_passed=6 frozen_failed=0 focused_test_files=2 focused_tests=33 focused_tests_passed=33 focused_tests_failed=0 provider_normalization_cycles=1 provider_seam_tests=4 security_surface_failures=0 eslint_errors=0 typecheck_errors=0 touch_set_violations=0 diff_check_errors=0
STATUS: COMPLETE

## Retained builder 2 evidence (superseded by builder 3 above)

## Audit completed before the frozen run

- getThreadContext passes every returned body through sanitizeMailContent, returns at most 20 non-draft messages, and caps total sanitized text at 65,536 UTF-8 bytes, including a multibyte-boundary test.
- createReplyDraft accepts only threadId, message, and a 1..128-character idempotency key. The active owned account, latest replyable provider message, owned aliases, recipients, subject, thread identity, and reply message identity are derived server-side.
- Gmail receives the derived provider threadId. Outlook uses Graph createReply on the derived message ID, patches that exact unsent reply draft, and never falls back to delete/recreate.
- listDrafts/getDraft/updateDraft resolve the active account at point of use. Missing, mismatched, and other-account draft IDs return the same Draft not found result. Draft projections exclude attachments and raw provider data.
- updateDraft verifies the opaque revision before provider mutation, updates in place, refetches provider state, and refuses a provider ID change. A stale revision produced zero extra mutation in the test.
- createReplyDraft and updateDraft share payload-bound atomic reservations. Each has a 20-concurrent-call proof with one provider effect; changed-payload reuse conflicts before a second effect.
- MCP instructions are self-contained in the first 512 characters. Read/write, destructive, idempotent, and open-world annotations match the catalogue.
- composeEmail is the only explicit AI/web egress tool and requires allowWebSearch=true. getThreadSummary no longer invokes AI. The default Codex/Claude policies exclude composeEmail.
- The Streamable HTTP smoke uses the installed WebStandardStreamableHTTPServerTransport and actual HTTP Request objects for initialize -> notifications/initialized -> tools/list -> context -> create reply -> get -> update, with zero send effects.
- Codex CLI 0.144.1 and Claude Code 2.1.209 local command shapes were checked. The setup guides link the current official Codex/Claude MCP and OAuth documentation and do not claim live OAuth, production, deploy, or mailbox mutation.
- The live catalogue and security gate contain exactly 23 tools, with only createDraft, createReplyDraft, updateDraft, enqueueDraftJob, cancelOutboxItem, and retryOutboxItem classified as writes. No send, approve, permanent-delete, spam, settings, or generic provider escape-hatch tool is registered.

## Preparatory provider-seam diagnostics

COMMAND: pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts -t 'Outlook reply-draft provider seam'
EXIT: 0
OUTPUT_BEGIN

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

 ✓ src/routes/agent/mcp-draft-loop.test.ts (9 tests | 7 skipped) 1ms

 Test Files  1 passed (1)
      Tests  2 passed | 7 skipped (9)
   Duration  314ms

OUTPUT_END

COMMAND: pnpm --filter @zero/server exec vitest run src/lib/driver/google-drafts.test.ts -t 'sans id'
EXIT: 0
OUTPUT_BEGIN

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

 ✓ src/lib/driver/google-drafts.test.ts (12 tests | 10 skipped) 4ms

 Test Files  1 passed (1)
      Tests  2 passed | 10 skipped (12)
   Duration  439ms

OUTPUT_END

## Corrected frozen commands

FROZEN_COMMAND: pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts src/routes/agent/mcp-tools.test.ts
EXIT: 0
OUTPUT_BEGIN

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

 ✓ src/routes/agent/mcp-tools.test.ts (23 tests) 11ms
 ✓ src/routes/agent/mcp-draft-loop.test.ts (9 tests) 37ms

 Test Files  2 passed (2)
      Tests  32 passed (32)
   Start at  03:14:06
   Duration  490ms (transform 146ms, setup 0ms, collect 351ms, tests 48ms, environment 0ms, prepare 87ms)

OUTPUT_END

FROZEN_COMMAND: node scripts/security/check-agent-surface.mjs
EXIT: 0
OUTPUT_BEGIN
Security surface check passed: least scopes, bounded session cache, draft-only MCP.
OUTPUT_END

FIRST_ATTEMPT_COMMAND: pnpm --filter @zero/server exec eslint src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm exec prettier apps/server/src/lib/driver/microsoft.ts docs/agent --check
EXIT: 1
OUTPUT_BEGIN
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
Checking formatting...
[warn] apps/server/src/lib/driver/microsoft.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
OUTPUT_END

CORRECTION_COMMAND: pnpm exec prettier apps/server/src/lib/driver/microsoft.ts --write
EXIT: 0
OUTPUT_BEGIN
apps/server/src/lib/driver/microsoft.ts 149ms
OUTPUT_END

FROZEN_COMMAND: pnpm --filter @zero/server exec eslint src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm exec prettier apps/server/src/lib/driver/microsoft.ts docs/agent --check
EXIT: 0
OUTPUT_BEGIN
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
Checking formatting...
All matched files use Prettier code style!
OUTPUT_END

FROZEN_COMMAND: pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit
EXIT: 0
OUTPUT_BEGIN

> @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server
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
declare module "*.sql" {
	const value: string;
	export default value;
}
Generating runtime types...

Runtime types generated.


✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.

OUTPUT_END

FROZEN_COMMAND: git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/src\/(routes\/agent\/mcp[^\/]*\.ts|lib\/driver\/.*)|docs\/agent\/.*|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-draft-loop-01\.md)$/ {print; bad=1} END {exit bad}'
EXIT: 0
OUTPUT_BEGIN
OUTPUT_END

FROZEN_COMMAND: git diff --check
EXIT: 0
OUTPUT_BEGIN
OUTPUT_END

COUNTS: frozen_commands=6 frozen_passed=6 frozen_failed=0 focused_test_files=2 focused_tests=32 focused_tests_passed=32 focused_tests_failed=0 provider_seam_tests=4 security_surface_failures=0 eslint_errors=0 typecheck_errors=0 touch_set_violations=0 diff_check_errors=0
STATUS: COMPLETE
