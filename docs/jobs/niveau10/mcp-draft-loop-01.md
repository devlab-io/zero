# MCP draft-loop — builder 5 provider-CAS fail-closed correction

MIRROR: BUILDER

BASELINE: `6debd120` Merge branch `factory/niveau10` into `job/niveau10/mcp-draft-loop-01`

RULING: `docs/jobs/niveau10/mcp-draft-loop-rulings.md`

SCOPE: judge-3 TOCTOU correction only; spec/check files unchanged; no commit or push

## PHASE 0

- Plan: make the provider capability explicit, bind the opaque MCP revision to a provider CAS
  token, route updates only through an atomic conditional-write seam, fail closed before the
  idempotency reservation when that seam is absent, then align runtime output, snapshot, docs,
  client policies, and HTTP smoke evidence.
- Disagreements: none. A local mutex, a second read, and the existing unconditional
  `createDraft({id})` path cannot satisfy the ruling. Gmail and Microsoft therefore remain usable
  for create/get while their MCP update capability is explicitly false.

## Builder 5 correction

- `projectOwnedDraft` now hashes the provider CAS token into the opaque revision. The token is
  never exposed to the MCP client.
- `updateDraft` resolves the active provider capability before entering
  `PayloadBoundIdempotency.execute`. Unsupported providers therefore perform zero idempotency
  reservation, provider read, conditional-write attempt, mutation, or send effect.
- A supported driver must expose both its token extractor and one atomic conditional-update
  operation. Missing seams and non-native concurrency declarations are normalized to unsupported.
- The conditional result distinguishes success, not-found, provider error, and precondition
  failure. A provider 412-equivalent becomes a stale-revision error and cannot fall back to an
  unconditional write.
- The successful fake-CAS cycle preserves the provider draft ID, persists provider-normalized
  content, and returns a fresh revision. A concurrent provider edit between read and write changes
  the token, receives the 412-equivalent, retains its own body, and records zero overwrite.
- Gmail and Microsoft are listed as `supported: false` in the static policy and active runtime
  capability. `getDraft` returns the active capability beside the bounded draft projection.
- The default Codex and Claude policies exclude/deny `updateDraft`. Their guides require a runtime
  `draftUpdate.supported=true` result before enabling it and otherwise direct the agent to create a
  new unsent draft for human review.
- Existing Gmail API `threadId` plus server-derived MIME `In-Reply-To`/`References`, provider-aware
  body normalization, ownership indistinguishability, 20-way payload-bound idempotency, draft-only
  registration, and zero-send guarantees remain covered.

## Frozen commands

FROZEN_COMMAND: `pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts src/routes/agent/mcp-tools.test.ts`

EXIT: 0

OUTPUT_BEGIN

```text
 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

 ✓ src/routes/agent/mcp-tools.test.ts (23 tests) 9ms
 ✓ src/routes/agent/mcp-draft-loop.test.ts (17 tests) 59ms

 Test Files  2 passed (2)
      Tests  40 passed (40)
   Start at  04:19:39
   Duration  790ms (transform 159ms, setup 0ms, collect 658ms, tests 68ms, environment 0ms, prepare 81ms)
```

OUTPUT_END

FROZEN_COMMAND: `node scripts/security/check-agent-surface.mjs`

EXIT: 0

OUTPUT_BEGIN

```text
Security surface check passed: least scopes, bounded session cache, draft-only MCP.
```

OUTPUT_END

FROZEN_COMMAND: `pnpm --filter @zero/server exec eslint src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm exec prettier apps/server/src/lib/driver/microsoft.ts docs/agent --check`

EXIT: 0

OUTPUT_BEGIN

```text
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
Checking formatting...
All matched files use Prettier code style!
```

OUTPUT_END

FROZEN_COMMAND: `pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit`

EXIT: 0

OUTPUT_BEGIN

```text
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
```

OUTPUT_END

FROZEN_COMMAND: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/src\/(routes\/agent\/mcp[^\/]*\.ts|lib\/driver\/.*)|docs\/agent\/.*|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-draft-loop-01\.md)$/ {print; bad=1} END {exit bad}'`

EXIT: 0

OUTPUT_BEGIN

```text
```

OUTPUT_END

FROZEN_COMMAND: `git diff --check`

EXIT: 0

OUTPUT_BEGIN

```text
```

OUTPUT_END

COUNTS: frozen_commands=6 frozen_passed=6 frozen_failed=0 focused_test_files=2 focused_tests=40 focused_tests_passed=40 focused_tests_failed=0 fake_cas_success_cycles=2 concurrent_provider_edit_412_cases=1 concurrent_provider_overwrites=0 no_cas_idempotency_reservations=0 no_cas_provider_reads_during_update=0 no_cas_conditional_attempts=0 no_cas_mutations=0 gmail_raw_mime_cycles=1 invalid_source_identity_cases=3 provider_normalization_cycles=1 security_surface_failures=0 eslint_errors=0 typecheck_errors=0 touch_set_violations=0 diff_check_errors=0 send_calls=0

STATUS: COMPLETE
