# ADR 0001 — One routing layer per responsibility (Hono vs tRPC)

- Status: Accepted
- Date: 2026-07-13
- Issue: devlab-io/zero#24 — [niveau9] V2.3 routing-consolidation
- Scope: `apps/server` routing surface only. No client, tRPC-procedure, DO
  binding, or SQLite-schema change (behaviour strictly unchanged).

## Context

The server exposed its HTTP surface through two overlapping mechanisms with no
written rule for which to use:

- **Hono** — the Cloudflare Worker's fetch router (`main.ts` built a 1261-LOC
  entry mixing the `ZeroDB` Durable Object, IP hashing, the `api`/`app` Hono
  apps, and the queue/cron `WorkerEntrypoint`).
- **tRPC** — `appRouter` (17 namespaces) mounted by Hono at `/api/trpc`.

Two specific smells motivated the issue:

1. `routes/chat.ts` (1610 LOC) exported `ZeroAgent`, `ZeroMCP` and `AgentRpcDO`
   — the **same class names** the live worker binds — suggesting a duplicated
   agent/websocket layer.
2. `routes/ai.ts` (Hono) and `trpc/routes/ai/*` (tRPC) shared the `ai` name,
   suggesting a duplicated AI surface.

## Decision

**Frontier.** Hono is retained **only** for surfaces that tRPC cannot model
cleanly: streaming/SSE, websockets, external webhooks, and the auth handler.
Everything request/response that a browser or the MCP calls as a typed
procedure stays on **tRPC**. Every remaining Hono route is justified below,
case by case. A single composition module — `routes/index.ts` — now mounts the
whole Hono surface; `main.ts` is reduced to the worker entrypoint (fetch/queue/
cron) plus Durable-Object re-exports.

### Remaining Hono routes and their justification

Full paths as resolved by `scripts/checks/route-inventory.mjs`
(`docs/adr/route-inventory-after.json`).

| Route | Category | Why it stays Hono |
|---|---|---|
| mount `/sse`, `/mcp`, `/mcp/thinking/sse` | streaming | MCP Server-Sent-Events transports (`ZeroMCP`/`ThinkingMCP` Durable Objects); long-lived streams, not request/response. |
| `agentsMiddleware('*')` (websocket `/agents/*`) | websocket | `hono-agents` upgrades to the `ZeroAgent` Durable Object over websockets. tRPC has no websocket transport here. |
| `GET /api/auth/*`, `POST /api/auth/*`, `OPTIONS /api/auth/*` | auth | `better-auth` owns its own handler and cookie/OAuth flows. |
| `GET /.well-known/oauth-authorization-server` | auth | OAuth discovery document consumed by external MCP clients. |
| `POST /api/ai/call`, `POST /api/ai/do/:action`, `GET /api/ai` | webhook | Telephony (Twilio/ElevenLabs) pipeline authenticated by a shared `X-Voice-Secret` + `X-Caller` header — an **external, non-session** caller returning `text/plain`. Not a browser/tRPC client. |
| `POST /api/autumn/*`, `GET/DELETE /api/autumn/*` | webhook/billing | Autumn/Stripe billing integration with its own customer-auth middleware and provider callbacks. |
| `GET /api/public/providers` | public | Unauthenticated bootstrap read served before a session exists. |
| `POST /a8n/notify/:providerId` | webhook | Google Pub/Sub push notification (bearer-token verified) → thread queue. |
| `POST /monitoring/sentry` | webhook | Sentry envelope tunnel (validates DSN host/project, forwards upstream). |
| `GET /health`, `GET /` | infra | Liveness probe and root redirect. |
| `/api/trpc/*` (via `trpcServer`) | tRPC host | Hono only *hosts* the tRPC handler; the procedures are the tRPC layer. |

Every entry above falls under streaming, websocket, webhook, auth, or bare
infra. **No remaining Hono route duplicates a tRPC procedure.**

### `routes/ai.ts` vs `trpc/routes/ai/*` — namespace overlap, not a duplicate

They share the `ai` name only. Their operations are disjoint and their auth
models differ:

| | Hono `routes/ai.ts` (`/api/ai/*`) | tRPC `ai.*` (`/api/trpc`) |
|---|---|---|
| Auth | `X-Voice-Secret` + verified caller phone | session / active connection |
| Caller | Twilio/ElevenLabs telephony webhook | browser front-end |
| Operations | `call`, `do/:action` (tool exec) | `compose`, `generateEmailSubject`, `generateSearchQuery`, `webSearch` |
| Response | `text/plain` for the voice pipeline | typed JSON |

The route inventory records this as `crossLayerNamespaceOverlap: ["ai"]` and the
duplication gate does **not** count it, because the operation sets do not
intersect. `routes/ai.ts` is left functionally intact (contract stable).

### `routes/chat.ts` — dead duplicate, deleted

`chat.ts` was **unreachable code**. Proof captured at HEAD `437c7c5a`:

- Zero importers repo-wide (`from '…/routes/chat'` → none; no dynamic import;
  no barrel re-export; no test).
- The worker entry is `src/main.ts` (`wrangler.jsonc → main`); it binds
  `ZeroAgent`/`ZeroMCP` from `routes/agent/**` (the live copies), never from
  `chat.ts`. `chat.ts`'s `ZeroAgent`/`ZeroMCP`/`AgentRpcDO` were stale
  ancestors of `routes/agent/index.ts` + `routes/agent/mcp.ts`.
- `chat.ts` carried **no** "Zero Email Inc." licence header (`grep -c` = 0), so
  its removal raises no licence obligation.

Deleting it removes the duplicated Durable-Object class definitions the
inventory flagged (`functionalDuplicates` 2 → 0) with no behavioural change.

### `main.ts` decomposition

`main.ts` (1242 LOC) → **333 LOC** worker entrypoint. Two extractions, both
behaviour-preserving pure moves:

- `routes/index.ts` (393 LOC) — `hashIpAddress` + the `api` and `app` Hono apps
  (the routing/middleware composition).
- `db/durable-objects.ts` (537 LOC) — the `DbRpcDO` (RpcTarget façade) and
  `ZeroDB` (SQLite Durable Object) classes, placed beside the `db/schema.ts`
  and `db/index.ts` they depend on.

`main.ts` **re-exports** `DbRpcDO` and `ZeroDB`, so the entry module's exported
class surface is identical — the `ZERO_DB` binding and `env.ts`'s
`import type { ZeroDB } from './main'` are unaffected. `wrangler.jsonc` is
untouched (empty diff), so Durable-Object bindings, class names and the SQLite
schema are unchanged (issue #24 / structure.md gate 4).

The lazy-import seam for the AI stack (#31) is **not** taken here (out of
scope); the `main.ts → routes/index.ts` split makes it a natural later change
(mount the AI-heavy sub-routers lazily inside `routes/index.ts`).

## Verification (method)

Behaviour-unchanged is proven by static analysis of the mounts plus the build
chain — no runtime server was stood up (the frozen check accepts "analyse
statique des montages"):

- **Endpoint contract**: `scripts/checks/route-inventory.mjs` before/after —
  23 Hono HTTP routes identical (0 removed, 0 added), 17 tRPC namespaces
  identical, `functionalDuplicates` 2 → 0.
- **Build**: `wrangler deploy --dry-run --env local` and `--env staging` both
  green (bundle + all bindings resolved). The bare `--dry-run` fails on the
  `.sql` loader — a pre-existing config trait (the loader rule lives under
  `env.local`), not a regression.
- **Types**: `typecheck-report --blocking` — server 0 (baseline 0),
  mail 17 (baseline 17). No regression.
- **Front**: `pnpm --filter @zero/mail build` green.
- **Tests**: `pnpm test` green.

## Consequences

- One documented rule for Hono-vs-tRPC; new endpoints have a decision tree.
- `main.ts` is a thin, readable entrypoint; the routing composition and the DB
  Durable Object each live in a single-responsibility module.
- 1610 LOC of dead code removed.
- `route-inventory.mjs` is a reusable gate: `--assert` fails CI if a future
  change re-introduces a functional Hono/tRPC duplicate.
