# Architecture

This document describes the real, post-`niveau9` architecture of this fork. Every claim below is
verifiable against the code at the path cited — the paths are the source of truth, not this prose.
For the decisions behind these structures, see `docs/adr/`.

## 1. Monorepo layout

pnpm workspace + Turborepo. Two apps, five packages.

| Path | Name | Role |
|---|---|---|
| `apps/mail/` | `@zero/mail` | Frontend email client — **React Router 7** SPA, deployed as a Cloudflare Worker fronting static assets. |
| `apps/server/` | `@zero/server` | Backend — Cloudflare Worker (Hono + tRPC + Durable Objects + Workflows + Queues). |
| `packages/types/` | `@zero/types` | Front↔server shared contracts (see ADR `0004-shared-types-package.md`). |
| `packages/cli/` | `@zero/cli` | `nizzy` CLI (env setup + type sync). Consumed by the root `nizzy`/`postinstall` scripts. |
| `packages/testing/` | `@zero/testing` | Playwright e2e suite (see `docs/testing.md`). |
| `packages/eslint-config/` | shared ESLint config | Lint baseline. |
| `packages/tsconfig/` | shared TS config | Compiler baseline. |

Workspace globs are in `pnpm-workspace.yaml`; the task graph is in `turbo.json`; `packageManager` is
`pnpm@10.15.0` (root `package.json`).

> Note: `AGENT.md`'s older structure list mentioned `apps/ios-app/` and `packages/db/` — neither
> exists in this fork. The table above is the authoritative list (`ls apps/ packages/`).

## 2. Runtime & deployment

Both apps run on **Cloudflare Workers** via `wrangler`. There is no Node server and no Next.js.

- **Server** (`apps/server/wrangler.jsonc`): worker `zero-server`, entry `src/main.ts`,
  `compatibility_date 2025-05-01`, `nodejs_compat`.
- **Mail** (`apps/mail/wrangler.jsonc`): worker `zero`, entry `workers/spa-fallback.ts`,
  `compatibility_date 2025-06-27`, static assets served from `./build/client/` via the `ASSETS`
  binding with `not_found_handling: "none"`. Environments: `zero-local`, `zero-staging`,
  `zero-production`.

Local dev ports: mail on `:3000` (`apps/mail/package.json` → `start: wrangler dev --port 3000`),
server on `:8787` (Google OAuth callback in `README.md` targets `localhost:8787`).

## 3. Server layers

The server worker entry `apps/server/src/main.ts` is a `WorkerEntrypoint` exposing three handlers:

- **`fetch`** → delegates to the Hono `app` (`apps/server/src/routes/`). Errors are captured to Sentry
  via `captureServerException` (`apps/server/src/lib/sentry.ts`, ADR `0005-server-sentry.md`).
- **`queue`** → dispatches by queue name: `subscribe-queue` (brain enablement), `send-email-queue`
  (scheduled/deferred send via the agent stub), `thread-queue` (runs the sync workflow via
  `WORKFLOW_RUNNER`).
- **`scheduled`** → `processScheduledEmails` (KV `scheduled_emails` → `send_email_queue`) and
  `processExpiredSubscriptions` (Postgres connections → `subscribe_queue`).

### 3.1 Routing: Hono vs tRPC

One routing layer per responsibility (ADR `0002-routing-hono-vs-trpc.md`):

- **Hono** owns the raw HTTP surface (auth callbacks, webhooks, agent/MCP mounts) under
  `apps/server/src/routes/`.
- **tRPC** owns the typed application API under `apps/server/src/trpc/` — router in
  `trpc/index.ts`, procedures in `trpc/routes/` (`mail`, `drafts`, `outbox`, `labels` → `label.ts`,
  `connections`, `settings`, `notes`, `templates`, `categories`, `brain`, `ai/`, `user`, `meet`,
  `bimi`, `shortcut`, `cookies`, `logging`).

### 3.2 Durable Objects

DO classes are declared in `apps/server/wrangler.jsonc` and exported from `apps/server/src/main.ts`:

| Binding | Class | Source |
|---|---|---|
| `ZERO_DRIVER` | `ZeroDriver` | `apps/server/src/routes/agent/zero-driver.ts` — per-connection mailbox, owns the DO SQLite (`threads` + `thread_labels`). |
| `ZERO_AGENT` | `ZeroAgent` | `apps/server/src/routes/agent/chat-agent.ts` — AI chat agent. |
| `SHARD_REGISTRY` | `ShardRegistry` | `apps/server/src/routes/agent/shard-registry.ts`. |
| `ZERO_MCP` | `ZeroMCP` | `apps/server/src/routes/agent/mcp.ts` — MCP surface (tools in `mcp-tools.ts`). |
| `THINKING_MCP` | `ThinkingMCP` | `apps/server/src/lib/sequential-thinking.ts`. |
| `WORKFLOW_RUNNER` | `WorkflowRunner` | `apps/server/src/pipelines.ts`. |
| `THREAD_SYNC_WORKER` | `ThreadSyncWorker` | `apps/server/src/routes/agent/sync-worker.ts`. |
| `ZERO_DB` | `ZeroDB` | `apps/server/src/db/durable-objects.ts` (also exports `DbRpcDO`). |

`ZeroAgent`, `ZeroDriver` and `ShardRegistry` are re-exported through the 25-line barrel
`apps/server/src/routes/agent/index.ts`, which is what survives of the pre-split 2262-line god-file
(ADR `0007-do-agent-decomposition.md`).

### 3.3 Workflows & queues

- **Workflows** (`apps/server/wrangler.jsonc` → `workflows`): `SyncThreadsWorkflow`
  (`apps/server/src/workflows/sync-threads-workflow.ts`) and `SyncThreadsCoordinatorWorkflow`
  (`.../sync-threads-coordinator-workflow.ts`). Engine helpers in
  `apps/server/src/thread-workflow-utils/`.
- **Queues**: `thread-queue`, `subscribe-queue`, `send-email-queue` (bindings in `wrangler.jsonc`,
  consumed in `main.ts` `queue()`).

## 4. Data flow: Gmail → DO SQLite → projection → client

```
Gmail  ──▶  Google driver         ──▶  Sync workflow          ──▶  DO SQLite (ZeroDriver)
(API)      apps/server/src/            SyncThreadsWorkflow /        threads + thread_labels
           lib/driver/google*.ts       thread-queue → WORKFLOW_RUNNER   (+ R2 THREADS_BUCKET bodies)
                                                                          │
 client MailList  ◀── use-mail-list-data.ts  ◀── tRPC mail  ◀── projection.ts
 (apps/mail)          (MailListData seam)         (trpc/routes/mail.ts)   (routes/agent/projection.ts)
```

- **Ingest**: the Google driver (`apps/server/src/lib/driver/google.ts` + `google-threads.ts`,
  `google-messages.ts`, `gmail-sync-persist.ts`, `gmail-batch.ts`, `gmail-backoff.ts`, …) pulls from
  the Gmail API. `microsoft.ts` (Outlook) exists but is frozen — see ADR
  `0011-microsoft-driver-frozen.md`.
- **Store**: threads/labels land in the per-connection DO SQLite (`ZeroDriver`, schema
  `apps/server/src/routes/agent/db/schema.ts`); message bodies land in R2 (`THREADS_BUCKET`,
  `threads-staging`). This DO SQLite is the *second* Drizzle config (ADR
  `0001-second-drizzle-config-durable-objects-sqlite.md`), isolated from the Postgres config.
- **Project**: `apps/server/src/routes/agent/projection.ts` is the **named read boundary** over that
  SQLite + R2 (`getThreadsFromDB` / `getThreadFromDB` / `searchThreads`), returning `ThreadsResponse`
  from `@zero/types`. It is the seam consumed by the rich list projection (#30) and the MCP surface
  (#36).
- **Serve**: exposed through the tRPC `mail` route (`apps/server/src/trpc/routes/mail.ts`).
- **Consume**: the client reads the list **exclusively** through the `MailListData` contract in
  `apps/mail/hooks/use-mail-list-data.ts` — the single seam where the server projection reshapes data
  and where network/error states surface. `apps/mail/components/mail/mail-list.tsx` renders through it
  and must not reach into `useThreads()`/react-query directly.

## 5. Storage map

| Store | Binding / config | Purpose |
|---|---|---|
| PostgreSQL | `HYPERDRIVE` (Hyperdrive) + Drizzle, `createDb` in `apps/server/src/db` | App/relational data (connections, settings, …). |
| DO SQLite | `ZeroDriver` DO, schema `routes/agent/db/schema.ts` | Per-connection thread/label mailbox (ADR 0001). |
| R2 | `THREADS_BUCKET` (`threads-staging`) | Thread message bodies. |
| Vectorize | `VECTORIZE`, `VECTORIZE_MESSAGE` | Thread/message embeddings. |
| KV | `scheduled_emails`, `snoozed_emails`, `pending_emails_status`, `pending_emails_payload`, `gmail_sub_age` | Scheduling, snooze, deferred-send bookkeeping. |

## 6. Boundaries & public exports

- **`@zero/types`** (`packages/types/src/index.ts`, re-exporting `driver.ts`, `enums.ts`,
  `message.ts`, `fallback-prompts.ts`) is the shared contract package. `apps/mail` consumes it
  (`apps/mail/hooks/use-threads.ts`, `apps/mail/lib/trpc-boundary.test-d.ts`) instead of importing
  `../server/src/**` — ADR `0004-shared-types-package.md`.
- **tRPC type boundary**: `apps/mail` derives its client types from a committed boundary
  (`apps/server/src/trpc/app-router.boundary.d.ts`, `apps/mail/lib/trpc-boundary.test-d.ts`; generator
  `apps/server/scripts/gen-trpc-boundary.mjs`, script `gen:trpc-boundary`) — ADR
  `0006-trpc-type-boundary.md`. See `docs/solutions/known-issues.md` for the snapshot-drift caveat.
- **draft-outbox**: the deferred-send state machine lives in `apps/server/src/lib/draft-outbox/`
  (`state-machine.ts` + `state-machine.test.ts`), surfaced by tRPC `trpc/routes/outbox.ts` and the
  agent `routes/agent/outbox.ts`.
- **Observability**: structured logger `apps/server/src/lib/logger.ts` (ADR
  `0004-structured-logger.md`); tracing `apps/server/src/lib/tracing.ts` (ADR `0003-tracing-strategy.md`).

## 7. Frontend (apps/mail)

- **React Router 7**, `ssr: false` (SPA), `buildDirectory: build`, `appDirectory: app`,
  `routeDiscovery.mode: initial` (`apps/mail/react-router.config.ts`). Route map in
  `apps/mail/app/routes.ts` (landing `page.tsx`, `/home`, `/login`, `/mail/*`, `/developer`, `/queue`,
  and the `(full-width)` marketing pages).
- **Prerendered landing shell**: `react-router.config.ts` prerenders `/` (and
  `/manifest.webmanifest`) to a static neutral shell at build time.
- **SPA-fallback worker**: `apps/mail/workers/spa-fallback.ts` fronts `ASSETS`. It serves existing
  assets as-is, serves the dedicated neutral shell `__spa-fallback.html` (200) for HTML *navigation*
  requests with no matching asset (so deep-links like `/mail/inbox` hydrate the right route instead of
  being shown marketing content), and passes non-navigation 404s through unchanged. This is the gate
  A8 / landing-prerender guarantee (`spa-fallback.test.ts`).
- **Lazy surfaces**: heavy mail surfaces are code-split — see
  `apps/mail/components/mail/mail-lazy-surfaces.tsx` and the lazy command palette
  (`components/context/command-palette-*.tsx`).
- **State/data**: TanStack Query + tRPC client (`apps/mail/providers/query-provider.tsx`), thread data
  through `use-threads.ts` → `use-mail-list-data.ts` (§4).

## 8. Environments & config

- Env is validated by a zod schema (`apps/server/src/env-schema.ts`) and booted via
  `apps/server/src/env.ts` (`bootEnv`). The `nizzy` CLI (`packages/cli`) generates/syncs env + types
  (`pnpm nizzy env`, `pnpm nizzy sync`; `postinstall` runs `nizzy sync`).
- Wrangler environments: server `--env local` for dev typegen/dev; mail `zero-local` /
  `zero-staging` / `zero-production`.

## 9. Related documents

- Decisions: `docs/adr/` (index in `docs/adr/README.md`).
- Tests & CI: `docs/testing.md`.
- Fork divergences & licensing: `FORK.md`, `LICENSE-NOTES.md`.
- Run diagnoses (env/tooling pitfalls, known issues): `docs/solutions/`.
