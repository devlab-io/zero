# Fork notes

This Devlab fork tracks Mail-0 as an internal product fork. Upstream staging is
treated as frozen around August 2025 and effectively dead; cherry-picks are
opportunistic only.

## Divergences

| Area | What changed | Evidence |
|---|---|---|
| Telemetry | Zero Email Inc. phone-home integrations were removed or made opt-in: Sentry DSN, Dub, Intercom, Datadog; PostHog and react-scan verified env-gated. | `005859de` |
| Self-host hardening | Twilio fallback, trusted origins for local frontends, Hyperdrive local port, Autumn opt-in billing stub, login force-signout repair, database/front local defaults. | `5e3888d0` |
| Mail UX shortcuts | Superhuman-style keyboard actions: `d` done, `r` reply, `a` reply-all, `f` forward, `h` remind; delete moved to `mod+backspace`; hover targeting restored; en/fr labels added. | `5e3888d0` |
| Tartine MCP surface | External Codex/MCP surface is draft.only: `sendEmail` removed; `createDraft` and `enqueueDraftJob` added; mail bodies returned to MCP are sanitized/spotlighted. | `factory/tartine` #3 |
| Tartine outbox | Draft outbox table, pure state machine, tRPC `outbox` router, Durable Object alarm processing, idempotence guards, approve/cancel/retry lifecycle. | `factory/tartine` #2 |
| Tartine queue UI | `/queue` review surface, draft-ready badge, approve/reject/open/retry actions, 15 second undo, en/fr labels. | `factory/tartine` #4 |
| Codex setup | Codex CLI setup docs and example config for the draft.only MCP workflow. | `factory/tartine` #5 |

## Tartine Boundary

The run's draft-only guarantee applies to the external MCP/Codex surface. The
agent can inspect mail, create Gmail drafts, and enqueue draft jobs, but it
does not receive an MCP send tool.

Human sending remains inside Zero through `/queue`: approve starts the 15 second
send window, and undo/cancel can stop it before the alarm sends.

## Known Open Risk

The in-app AI chat agent still has a separate send capability:

- `apps/server/src/routes/agent/tools.ts:283`
- `Tools.SendEmail` in `apps/server/src/types.ts:228`

This is outside tartine's approved scope. It should be treated as a future run
candidate if the fork wants one universal "AI never sends directly" invariant.

## Cherry-Pick Policy

Because upstream is not an active source of reliable changes, do not maintain a
standing merge cadence. Cherry-pick only clear, useful upstream fixes after
reviewing them against this fork's telemetry, self-hosting, and draft.only
boundaries.
