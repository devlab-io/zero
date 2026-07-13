# Testing

The monorepo has two test layers: **unit** (vitest, per app, run via turbo) and
**e2e** (Playwright, in `@zero/testing`).

## Prerequisites

```bash
pnpm install
```

Unit tests do **not** require wrangler-generated types or a running app. The
current suites (`draft-outbox` state machine, `mail-sanitize`, queue view model)
are pure logic / pure-JS HTML parsing, so no `wrangler types` step is needed.

## Unit tests (vitest)

Run every app's unit tests through turbo from the repo root:

```bash
pnpm test          # turbo run test  → @zero/server + @zero/mail vitest run
```

- `apps/server` — `environment: node`, matches `src/**/*.test.ts`.
- `apps/mail` — `environment: happy-dom`, matches `{app,components,lib,hooks,store}/**/*.test.{ts,tsx}`.

Run a single app directly (watch mode, filtering, etc.):

```bash
pnpm --filter=@zero/server test          # vitest run (server only)
pnpm --filter=@zero/mail test            # vitest run (mail only)
pnpm --filter=@zero/server exec vitest   # watch mode for one app
pnpm --filter=@zero/server exec vitest run path/to/file.test.ts   # single file
```

The turbo `test` task is not cached (`"cache": false`): tests re-run every
invocation, so a green result always reflects the current code.

## E2E tests (Playwright, `@zero/testing`)

E2E lives in `packages/testing` and is **run locally, not in CI** for this wave.

```bash
# one-time: install Playwright browsers
pnpm --filter=@zero/testing exec playwright install

# start the app the specs drive (default baseURL http://localhost:3000)
pnpm --filter=@zero/mail start           # or: pnpm dev

# in another shell, run the e2e suite
pnpm test:e2e                            # → pnpm --filter=@zero/testing test:e2e
```

Other e2e entry points (from `@zero/testing`):

```bash
pnpm --filter=@zero/testing test:e2e:ui       # Playwright UI mode
pnpm --filter=@zero/testing test:e2e:debug    # step debugger
pnpm --filter=@zero/testing test:e2e:headed   # headed browser
```

E2E config: `packages/testing/playwright.config.ts` (reads `../../.env`, base URL
from `PLAYWRIGHT_BASE_URL`, auth via `e2e/auth.setup.ts`). Set `CI=1` to enable
retries and `forbidOnly`.
