# Rulings — tartine / queue-view (issue #4) · append-only, orchestrator-owned

## 2026-07-05 — BLOCKED answer + boundary amendment: routes.ts

Builder BLOCKED correctly: `apps/mail/app/routes.ts` is the app's manual
react-router registry (routes.ts:24-53 registers /developer, /mail/**,
/settings/**, catch-all) and was missing from MAY TOUCH — decomposition gap
(orchestrator assumed file-based routing). Builder built everything allowed;
all frozen RUN checks pass locally; `/queue` cannot mount without the registry.

RULING (boundary amendment): MAY TOUCH extended with `apps/mail/app/routes.ts`
— isolated additive route-registration line(s) for /queue only, following the
existing entries' pattern. No other change to that file. Everything else
unchanged. Judge should read boundary compliance with this amendment.

Note also builder's in-bounds adaptation, approved: pending badge implemented
inside app-sidebar.tsx (NavMain.badge not rendered by nav-main.tsx:318-325,
which is out of bounds) — acceptable as an isolated addition.
