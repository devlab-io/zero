# a5-front-console-01 — front `console.*` sweep (A5 observability)

- Wave: V7 « niveau réel » (niveau9). Branch: `job/niveau9/a5-front-console-01`.
- Freeze SHA: `375d1003b2f86ba53b28b5ef6e7b2d48c75fb320`.
- Axis: A5 (observabilité) — the missing −0,5 of the final judgment: front `console.*` was
  the last un-lowered palier metric.

## Objective

Lower the FROZEN grading-rubric A5 front metric

```
grep -rE "console\." apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store \
  --include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l
```

from **121** to the palier-8.5 target **≤40**, residuals justified site by site, with **zero
logic/flow change** and **no loss of any error signal** (an error that reached the console must
still reach somewhere visible).

## Phase 0 inventory (121)

- 79 `console.error` — almost all `catch(e){ console.error(...) }` = useful error signal.
- 16 `console.warn` — 12 genuine warnings + 4 mis-levelled debug (`Search applied` ×2,
  `toolCall`, `modifyLabels` shown below as warn/log).
- 19 `console.log` — throwaway debug.
- 6 `console.time`/`timeEnd` — dead perf profiling in `lib/email-utils.client.tsx`.
- 1 false positive — `components/ui/nav-main.tsx` comment containing the prose « support console. ».
- Of the above, 5 lines were already commented-out dead code (still counted by the grep).

Destination infra verified:
- Client Sentry (`app/instrument.ts`) is **opt-in (`VITE_PUBLIC_SENTRY_DSN`), OFF by default**,
  dynamically imported to stay out of the critical bundle (w2cd). ⇒ Sentry alone cannot be the
  error sink; the backbone must stay console-backed.
- Server precedent #29 / ADR 0004 (`apps/server/src/lib/logger.ts`): dependency-free structured
  logger, swept `error→error / warn→warn / log|info→info / debug|trace→debug`, residual = its own
  sinks. This is the model mirrored here.

## Ruling (orchestrator) — Option 1

`lib/log.ts` front twin of the server logger (dependency-free, one native `console.*` sink per
level), **no Sentry** (named follow-up for the owner: wire the DSN-gated dynamic-import Sentry
forward — mirroring `app/entry.client.tsx` — only once a DSN exists; NULL value until then).

Sub-decisions:
1. `debug`/`info` no-op in production (`import.meta.env.DEV` gate). Documented divergence from the
   server logger — the browser console is a user-visible surface, not an ops stream.
2. Hard-delete the 6 `console.time/timeEnd` + the `settings/security/page.tsx` `console.log(values)`
   (a **form-value leak on a security page** — micro security gain, not just cleanup).
3. Delete the 5 dead commented-out `console.*` lines.
4. `components/ui/ai-sidebar.tsx` `onError: (e) => console.log(e)` → **`log.error`** (the sole
   semantic-level correction of the sweep): under Option 1 `log`→debug is invisible in prod, so a
   strict level-preserving map would DROP an existing error-handler signal — signal preservation
   wins over level preservation for this one site.
5. The 4 mis-levelled warns stay `warn→warn` (strict, no second exception).
6. `app/entry.client.tsx:11` kept as-is (bespoke top-level React `reportRenderError`, already
   Sentry-wired by hand).

Re-snapshot of the console-ratchet front budget (143 → new real): owner does it post-merge (as on
#42); this job ships the honest final count only.

## Mechanical sweep

- New `apps/mail/lib/log.ts` — `log.{debug,info,warn,error}`, args forwarded VERBATIM (byte-identical
  warn/error output to the calls they replace), `debug`/`info` gated to `import.meta.env.DEV`.
- Global rewrite across `apps/mail/{app,components,lib,hooks,store,providers}` (import `@/lib/log`):
  `console.error→log.error` (incl. `.catch(console.error)→.catch(log.error)`), `console.warn→log.warn`,
  `console.log→log.debug`, `console.info→log.info`.
- 52 files import `log`; no duplicate/orphan imports.

## Result — 121 → 6 (target ≤40 met)

Frozen-metric residuals (6), each justified:
- `lib/log.ts` — 4 intentional sinks (`console.debug/info/warn/error`) + 0 header mentions
  (header reworded to avoid the literal token). By design, exactly like #29's sinks.
- `app/entry.client.tsx:11` — bespoke React `reportRenderError` warn, already Sentry-wired (ruling).
- `components/ui/nav-main.tsx` — prose comment « support console. » (false positive, not a call).

Providers residual: 0.

## Gates

- Type sequence (server `wrangler types` → mail `wrangler types` → `react-router typegen` →
  `TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`): **server 0 · mail 0**.
- `pnpm --filter @zero/mail test`: **139/139 passed (23 files)**, RC=0.
- `pnpm --filter @zero/mail build`: **RC=0** (prerender OK).
- `node scripts/checks/console-ratchet.mjs`: **PASSED** — `console(front)=6/143`, `console(server)=8/8`.
- eslint on touched files clean (removed one now-orphaned `// eslint-disable-line no-console` in
  `hooks/use-compose-editor.ts`).

Pre-existing, out of scope, NOT caused by this job: `app/entry.server.tsx` `_loadContext` unused-var
eslint error (present verbatim on the freeze; eslint is not in this job's gate set).
