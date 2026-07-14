MIRROR: ORCHESTRATOR

```text
$ pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-auth.test.ts src/routes/agent/mcp-account.test.ts src/routes/agent/mcp-idempotency.test.ts src/routes/agent/mcp-tools.test.ts

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/apps/server

 ✓ src/routes/agent/mcp-account.test.ts (2 tests) 3ms
 ✓ src/routes/agent/mcp-idempotency.test.ts (3 tests) 11ms
 ✓ src/routes/agent/mcp-tools.test.ts (19 tests) 10ms
 ✓ src/routes/agent/mcp-auth.test.ts (4 tests) 8ms

 Test Files  4 passed (4)
      Tests  28 passed (28)
   Start at  01:58:59
   Duration  253ms (transform 124ms, setup 0ms, collect 256ms, tests 32ms, environment 0ms, prepare 167ms)
EXIT 0
```

```text
$ node scripts/security/check-agent-surface.mjs
Security surface check passed: least scopes, bounded session cache, draft-only MCP.
EXIT 0
```

```text
$ pnpm --filter @zero/server exec eslint src/routes/index.ts src/lib/logger.ts src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
EXIT 0
```

```text
$ pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit

> @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-foundation-01/apps/server
> wrangler types --env local


 ⛅️ wrangler 4.32.0
───────────────────
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

────────────────────────────────────────────────────────────
✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.
EXIT 0
```

```text
$ git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/(src\/routes\/index\.ts|src\/lib\/logger\.ts|src\/routes\/agent\/mcp[^\/]*\.ts)|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-foundation-01\.md)$/ {print; bad=1} END {exit bad}'
EXIT 0
STDOUT 0 bytes
```

```text
$ git diff --check
EXIT 0
STDOUT 0 bytes
```

STATUS: COMPLETE
