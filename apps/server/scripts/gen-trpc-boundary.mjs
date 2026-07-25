#!/usr/bin/env node
// gen-trpc-boundary — regenerate the committed AppRouter type boundary for apps/mail.
//
// Issue devlab-io/zero#43. apps/mail consumes `AppRouter` as a *type only*, but importing
// it from the server source (`@zero/server/trpc`) drags the whole server module graph
// (env.ts -> main.ts -> agent/workflow/…) into apps/mail's `tsc` program, because a `.ts`
// import forces tsc to type-check the entire transitive graph. The only barrier tsc does
// NOT walk through is a `.d.ts` declaration file. This generator emits the declaration of
// `src/trpc/router.ts` (the AppRouter definition) and commits it as a self-contained
// boundary that apps/mail resolves via a tsconfig `paths` redirect.
//
// The emitted declaration references only: @trpc/server, hono, ai (node_modules),
// @zero/types (leaf workspace package), a few leaf server modules (../types,
// ../types/logging, ../lib/cookies, ../lib/draft-outbox — none of which reach env.ts),
// and the server context env `ZeroEnv` (via `import("../env")`). Only the last would drag
// the graph, and it is client-unused (the tRPC client never reads `ctx.c.env`), so it is
// replaced with a structural placeholder.
//
// Determinism: same sources -> byte-identical output. CI re-runs this and fails on drift.
// Prerequisite: `wrangler types` must have generated worker-configuration.d.ts.

import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EMIT_DIR = resolve(serverDir, 'node_modules/.cache/trpc-boundary');
const EMITTED = resolve(EMIT_DIR, 'trpc/index.d.ts');
const OUT = resolve(serverDir, 'src/trpc/app-router.boundary.d.ts');

const HEADER = `// GENERATED — DO NOT EDIT BY HAND.
// Regenerate: pnpm --filter @zero/server gen:trpc-boundary
// Source of truth: apps/server/src/trpc/router.ts (emitted via tsconfig.boundary.json).
//
// apps/mail's type boundary for AppRouter (issue devlab-io/zero#43): a self-contained
// declaration carrying every procedure's exact input/output types, with the client-unused
// server context env neutralised so apps/mail's tsc no longer compiles the server graph.
// A CI check re-runs the generator and fails on drift. See docs/adr/0006-trpc-type-boundary.md.
`;

function main() {
  rmSync(EMIT_DIR, { recursive: true, force: true });
  mkdirSync(EMIT_DIR, { recursive: true });

  // Declaration emit. Exit code is non-zero because non-portable server-only exports
  // (createAuth via ctx) are in the program — but they ne bloquent pas index.d.ts. On
  // valide l'artefact produit plutôt que le code de sortie.
  try {
    execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.boundary.json'], {
      cwd: serverDir,
      stdio: 'pipe',
    });
  } catch {
    /* expected: non-portable server-only exports elsewhere in the program */
  }

  if (!existsSync(EMITTED)) {
    console.error('[gen-trpc-boundary] FAILED: router.d.ts was not emitted.');
    console.error('  Check that `wrangler types` has run and src/trpc/router.ts compiles.');
    process.exit(1);
  }

  let dts = readFileSync(EMITTED, 'utf8');

  // `serverTrpc` n'est plus réexporté par ./index (pitbull A8, axe 1 : ce re-export formait
  // un cycle avec ./server-caller, dont plus aucun module ne dépendait). Il n'y a donc plus
  // rien à retirer ici — le filet ci-dessous vérifie qu'aucune référence à server-caller ne
  // réapparaît dans la frontière committée.

  // Neutralise the client-unused server context env (the sole graph-dragging reference).
  const ENV_REF = 'import("../env").ZeroEnv';
  if (!dts.includes(ENV_REF)) {
    console.error(`[gen-trpc-boundary] FAILED: expected reference ${ENV_REF} not found.`);
    console.error('  The context shape changed — review the boundary before regenerating.');
    process.exit(1);
  }
  dts = dts.split(ENV_REF).join('Record<string, unknown>');

  // Safety net: no residual server-graph specifier may survive into the committed boundary.
  const banned =
    /(import\("(\.\.\/(env|main|routes\/agent|pipelines|db)|\.\.\/\.\.\/)[^"]*"\)|server-caller)/;
  const offending = dts.split('\n').find((l) => banned.test(l));
  if (offending) {
    console.error('[gen-trpc-boundary] FAILED: residual server-graph reference in boundary:');
    console.error('  ' + offending.trim().slice(0, 160));
    process.exit(1);
  }

  writeFileSync(OUT, HEADER + dts);
  rmSync(EMIT_DIR, { recursive: true, force: true });
  console.log('[gen-trpc-boundary] wrote', OUT);
}

main();
