# Fresh worktree wrangler types trap

## Symptom

A fresh worktree installed with:

```bash
pnpm install --offline --frozen-lockfile --ignore-scripts
```

can show four extra TypeScript errors versus the frozen baseline. The missing
ambient file is:

```text
worker-configuration.d.ts
```

In tartine, this created phantom `tsc` failures even though the slice code
matched the judged baseline.

## Root Cause

`--ignore-scripts` skips the root `postinstall` script:

```bash
pnpm nizzy sync
```

Without that sync and without Wrangler type generation, the app-specific Worker
ambient types are absent from the worktree.

Relevant paths:

- `package.json` -> `scripts.postinstall`
- `apps/server/package.json` -> `scripts.types`
- `apps/mail/package.json` -> `scripts.types`

## Fix

Regenerate types for the affected app before judging TypeScript output:

```bash
pnpm run -C apps/server types
pnpm run -C apps/mail types
```

If Wrangler needs a sandboxed home/config directory, run the server substitute
from `apps/server`:

```bash
HOME=/private/tmp/wrangler-home XDG_CONFIG_HOME=/private/tmp/wrangler-config wrangler types --env local --include-runtime false
```

Then rerun the frozen typecheck command. Treat errors caused only by the missing
`worker-configuration.d.ts` as environment repair work, not slice code debt.
