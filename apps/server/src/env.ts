import type { ThinkingMCP, ThreadSyncWorker, WorkflowRunner, ZeroDB, ZeroMCP } from './main';
import type { ShardRegistry, ZeroAgent, ZeroDriver } from './routes/agent';

import { env as _env } from 'cloudflare:workers';
import type { QueryableHandler } from 'dormroom';
import { assertServerEnv } from './env-schema';

export { assertServerEnv, type RequiredServerEnv } from './env-schema';

export type ZeroEnv = {
  ZERO_DRIVER: DurableObjectNamespace<ZeroDriver & QueryableHandler>;
  SHARD_REGISTRY: DurableObjectNamespace<ShardRegistry & QueryableHandler>;
  ZERO_DB: DurableObjectNamespace<ZeroDB>;
  ZERO_AGENT: DurableObjectNamespace<ZeroAgent>;
  ZERO_MCP: DurableObjectNamespace<ZeroMCP & QueryableHandler>;
  THINKING_MCP: DurableObjectNamespace<ThinkingMCP & QueryableHandler>;
  WORKFLOW_RUNNER: DurableObjectNamespace<WorkflowRunner & QueryableHandler>;

  THREAD_SYNC_WORKER: DurableObjectNamespace<ThreadSyncWorker>;
  SYNC_THREADS_WORKFLOW: Workflow;
  SYNC_THREADS_COORDINATOR_WORKFLOW: Workflow;
  HYPERDRIVE: { connectionString: string };
  pending_emails_status: KVNamespace;
  pending_emails_payload: KVNamespace;
  scheduled_emails: KVNamespace;
  send_email_queue: Queue;
  snoozed_emails: KVNamespace;
  gmail_sub_age: KVNamespace;
  subscribe_queue: Queue;
  AI: Ai;
  gmail_history_id: KVNamespace;
  gmail_processing_threads: KVNamespace;
  subscribed_accounts: KVNamespace;
  connection_labels: KVNamespace;
  prompts_storage: KVNamespace;
  /** Devlab: cache better-auth (sessions/rate-limit) — optionnel, absent = Redis ou Postgres seul. */
  AUTH_CACHE?: KVNamespace;
  NODE_ENV: 'local' | 'development' | 'production';
  JWT_SECRET: 'secret';
  ELEVENLABS_API_KEY: '1234567890';
  DISABLE_CALLS: 'true' | '';
  DROP_AGENT_TABLES: 'false';
  THREAD_SYNC_MAX_COUNT: '5' | '20' | '10';
  THREAD_SYNC_LOOP: 'false' | 'true';
  DISABLE_WORKFLOWS: 'true';
  AUTORAG_ID: '';
  USE_OPENAI: 'true';
  BASE_URL: string;
  VITE_PUBLIC_APP_URL: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  VITE_PUBLIC_POSTHOG_KEY: string;
  VITE_PUBLIC_POSTHOG_HOST: string;
  COOKIE_DOMAIN: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
  HISTORY_OFFSET: string;
  ZERO_CLIENT_ID: string;
  ZERO_CLIENT_SECRET: string;
  VITE_PUBLIC_BACKEND_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  OPENAI_API_KEY: string;
  BRAIN_URL: string;
  COMPOSIO_API_KEY: string;
  GROQ_API_KEY: string;
  EARLY_ACCESS_ENABLED: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  AUTUMN_SECRET_KEY: string;
  /** Devlab: opt-in Dub attribution analytics — absent in self-host */
  DUB_API_KEY?: string;
  /**
   * Ask Reta BYOK vault KEK ring (slice 3A + release-fix): Worker secrets,
   * each base64url of EXACTLY 32 bytes. ALL OPTIONAL — no ring means the
   * vault is unavailable (fail closed with a fixed error); Workers AI models
   * keep working without it. RETA_BYOK_KEK_ACTIVE names the version new
   * envelopes are wrapped under (default 'v1'); rows under another present
   * version are lazily rewrapped at use (runbook
   * docs/runbooks/reta-byok-kek-rotation.md). Never logged, never echoed.
   */
  RETA_BYOK_KEK_V1?: string;
  RETA_BYOK_KEK_V2?: string;
  RETA_BYOK_KEK_ACTIVE?: string;
  /**
   * P18 — intégration Linear (email-first). TOUS OPTIONNELS : absents, la
   * fonctionnalité intégration fail closed (l'UI owner explique la
   * configuration manquante) sans bloquer le reste. Le ring KEK ci-dessus
   * scelle les tokens ; LINEAR_WEBHOOK_SECRET est le signing secret de
   * l'application (webhooks configurés côté app — jamais de scope admin).
   */
  LINEAR_CLIENT_ID?: string;
  LINEAR_CLIENT_SECRET?: string;
  LINEAR_WEBHOOK_SECRET?: string;
  AI_SYSTEM_PROMPT: string;
  PERPLEXITY_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  VITE_PUBLIC_ELEVENLABS_AGENT_ID: string;
  REACT_SCAN: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  VOICE_SECRET: string;
  ARCADE_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_MINI_MODEL: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_S_ACCOUNT: string;
  AXIOM_API_TOKEN: string;
  AXIOM_DATASET: string;
  THREADS_BUCKET: R2Bucket;
  thread_queue: Queue;
  VECTORIZE: VectorizeIndex;
  VECTORIZE_MESSAGE: VectorizeIndex;
  DEV_PROXY: string;
  MEET_AUTH_HEADER: string;
  MEET_API_URL: string;
  ENABLE_MEET: 'true' | 'false';
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_SERVICE_NAME?: string;
  DD_API_KEY: string;
  DD_APP_KEY: string;
  DD_SITE: string;
  /** Devlab: server-side Sentry — absent = Sentry disabled (clean no-op). */
  SENTRY_DSN?: string;
  /** Devlab: build/release tag attached to captured Sentry events. */
  SENTRY_RELEASE?: string;
};

// `_env` is the wrangler-generated `Cloudflare.Env` (broad string types); `ZeroEnv`
// is this app's typed view with narrowed literals for a few vars. The two are
// deliberately different shapes, so assert through `unknown` (TS-suggested form).
const env = _env as unknown as ZeroEnv;
export { env };

// --- Boot-time validation (A5) --------------------------------------------------------
// The zod schema + `assertServerEnv` live in ./env-schema (a dependency-free module that can
// be unit-tested in Node without the `cloudflare:workers` import). `bootEnv` is the runtime
// guard called at first request/queue/scheduled invocation.
let booted = false;

/** Boot guard: validates the required env exactly once per isolate. Call at first request. */
export function bootEnv(
  raw: Record<string, unknown> = env as unknown as Record<string, unknown>,
): void {
  if (booted) return;
  assertServerEnv(raw);
  booted = true;
}
