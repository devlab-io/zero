# Security wave 1 — auth, OAuth scopes, agent surface

Date: 2026-07-12 · Branch: `factory/niveau8`

## Measured delta

| Check | Before | After |
|---|---:|---:|
| `pnpm audit --prod` critical advisories | 7 | 0 |
| High advisories | 100 in the pre-run audit | 71 |
| Better Auth | 1.3.7 | 1.6.23 |
| Unrestricted `mail.google.com` OAuth scope | present | removed |
| Session cookie cache revalidation | 30 days | 5 minutes |
| In-app agent send tool | registered | removed |
| In-app agent bulk-trash tool | registered | removed |
| In-app agent delete-label tool | registered | removed |

Remaining high advisories are not declared safe by this result. They remain a tracked audit and
reachability task under the frozen security check.

## Verification

- `node scripts/security/check-agent-surface.mjs` — PASS.
- Targeted Oxlint on auth, Gmail driver, agent registry, MCP, and the assertion script — PASS.
- `pnpm --filter @zero/mail build` — PASS after the React Router 7.18 migration flag rename.
- `wrangler deploy --dry-run --env local` — PASS, 21,980 KiB / 2,763 KiB gzip Worker bundle.
- No deployment or OAuth-console change was performed.

The production audit still reports 16 low, 77 moderate, and 71 high findings. The most relevant
remaining classes (mail rendering/linkification, HTTP parsers, telemetry dependencies, and old
tooling pulled as runtime dependencies) must be removed, upgraded, or documented with a concrete
reachability decision before final acceptance.

