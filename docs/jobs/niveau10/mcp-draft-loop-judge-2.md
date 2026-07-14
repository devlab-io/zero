MIRROR: ORCHESTRATOR

- Checks integrity: PASS
  Raw evidence:
  ```text
  freeze_sha: 4896eefb53b89d5f11b019021c3aa65b648f01ca
  integrity: check_file_matches_freeze=true head=f2faa1df8b0197a0571e3094054d6ee34ff70e5d
  docs_checks_touched=false

  $ git diff 4896eefb53b89d5f11b019021c3aa65b648f01ca..HEAD -- docs/checks/
  [no output]
  exit: 0

  $ git status --porcelain=v1 --untracked-files=all
  [no output]
  exit: 0

  $ git diff --name-status f2faa1df8b0197a0571e3094054d6ee34ff70e5d..HEAD
  M	docs/jobs/niveau10/mcp-draft-loop-checkrun.md
  exit: 0
  ```

- Diff vs intent: FAIL
  Raw evidence: The frozen contract requires a genuine server-derived reply draft at `docs/checks/niveau10/mcp-draft-loop.md:20-21` and `docs/spec/niveau10-mailos.md:134-138,201-202`. The handler derives `replyToMessageId` at `apps/server/src/lib/driver/agent-drafts.ts:275-310` and forwards it at `apps/server/src/routes/agent/mcp-draft-loop.ts:128-137`. Outlook consumes that identity through Graph `createReply` at `apps/server/src/lib/driver/microsoft.ts:733-746`, but Gmail constructs MIME with only recipients, subject and body at `apps/server/src/lib/driver/google-drafts.ts:152-178`, then supplies only `raw` and `threadId` at `apps/server/src/lib/driver/google-drafts.ts:225-229`. It never emits the required `References` or `In-Reply-To` headers. Gmail requires `threadId`, matching subject, and RFC-compliant `References`/`In-Reply-To` for a draft to join a thread ([official Gmail threading contract](https://developers.google.com/workspace/gmail/api/guides/threads)). The Gmail test only checks `threadId` at `apps/server/src/lib/driver/google-drafts.test.ts:221-235`, so it cannot detect this failure.

- Per check:

  - RUN line 9: PASS
    Command: `pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts src/routes/agent/mcp-tools.test.ts`
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0

     RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

     ✓ src/routes/agent/mcp-tools.test.ts (23 tests) 15ms
     ✓ src/routes/agent/mcp-draft-loop.test.ts (10 tests) 57ms

     Test Files  2 passed (2)
          Tests  33 passed (33)
       Start at  03:33:43
       Duration  730ms (transform 147ms, setup 0ms, collect 564ms, tests 73ms, environment 0ms, prepare 88ms)
    ```

  - RUN line 10: PASS
    Command: `node scripts/security/check-agent-surface.mjs`
    Source: re-run
    Raw evidence:
    ```text
    exit: 0
    Security surface check passed: least scopes, bounded session cache, draft-only MCP.
    ```
    This exactly matches the evidence-file output and exit code.

  - RUN line 11: PASS
    Command: `pnpm --filter @zero/server exec eslint src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm exec prettier apps/server/src/lib/driver/microsoft.ts docs/agent --check`
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0
    Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
    Checking formatting...
    All matched files use Prettier code style!
    ```

  - RUN line 12: PASS
    Command: `pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit`
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0

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
    		OTEL_SERVICE_NAME: "zero-email-server-local" | "zero-email-server-staging.devlab-tahiti.workers.dev" | "zero-email-server-production.devlab-tahiti.workers.dev";
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
    ```

  - RUN line 13: PASS
    Command: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/src\/(routes\/agent\/mcp[^\/]*\.ts|lib\/driver\/.*)|docs\/agent\/.*|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-draft-loop-01\.md)$/ {print; bad=1} END {exit bad}'`
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0
    [no stdout/stderr]
    ```

  - RUN line 14: PASS
    Command: `git diff --check`
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0
    [no stdout/stderr]
    ```

- Slice verdict: FAIL
  Decisive reason: Gmail reply drafts omit the mandatory `References` and `In-Reply-To` headers, so the provider cannot guarantee that `createReplyDraft` creates the required draft inside the original thread despite every frozen RUN passing.
