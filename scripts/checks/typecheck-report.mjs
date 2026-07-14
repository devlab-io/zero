#!/usr/bin/env node
// typecheck-report — A2/A4 typecheck in REPORT mode with a non-growing ratchet.
//
// Runs the frozen typecheck commands (after `wrangler types` has been generated):
//   pnpm --filter @zero/server exec tsc --noEmit
//   pnpm --filter @zero/mail   exec tsc --noEmit
// counts `error TSxxxx` lines, and compares against the measured baseline.
//
// MODE (the "commutateur", orchestrator decision at end of wave 1):
//   report  (default)      — never fails the build; prints counts; a regression
//                            above baseline is surfaced as a ::warning::.
//   blocking (TYPECHECK_BLOCKING=1|true, or --blocking) — exits 1 when a scope's
//                            error count EXCEEDS its baseline (non-growing ratchet).
//
// Baseline = errors MEASURED at job time. #20/#21 drive these toward 0; when they
// lower the baseline here and the orchestrator flips the switch, tsc becomes a
// hard gate.

import { execSync } from 'node:child_process';

// Flip sortie de vague 1 (ruling #13, freeze/niveau9-v3) : server porté à 0 par #21
// (gate dure) ; mail mesuré à 17 sous la séquence complète (wrangler types + react-router
// typegen). Le gate « mail 0 TOTAL » a été transféré à #43 (trpc-type-boundary) et est
// désormais ATTEINT : apps/mail consomme `@zero/server/{trpc,auth}` depuis une frontière de
// types self-contained (app-router.boundary.d.ts + lib/auth.boundary.d.ts, redirigées par
// tsconfig `paths`), donc son programme tsc ne compile plus les sources serveur. Baseline
// abaissée 17 -> 0. Ne jamais élargir. Voir docs/adr/0006-trpc-type-boundary.md.
const BASELINE = { server: 0, mail: 0 };

const blocking =
  process.argv.includes('--blocking') ||
  /^(1|true|yes)$/i.test(process.env.TYPECHECK_BLOCKING ?? '');

function tscErrors(filter) {
  const cmd = `pnpm --filter ${filter} exec tsc --noEmit`;
  let out = '';
  try {
    out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // tsc exits non-zero when there are errors — that is expected in report mode.
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  const matches = out.match(/error TS\d+/g);
  return matches ? matches.length : 0;
}

const server = tscErrors('@zero/server');
const mail = tscErrors('@zero/mail');

console.log(`typecheck-report [mode=${blocking ? 'blocking' : 'report'}]`);
console.log(`  server: ${server} errors (baseline ${BASELINE.server})`);
console.log(`  mail:   ${mail} errors (baseline ${BASELINE.mail})`);

const regressions = [];
if (server > BASELINE.server) regressions.push(`server ${server} > baseline ${BASELINE.server}`);
if (mail > BASELINE.mail) regressions.push(`mail ${mail} > baseline ${BASELINE.mail}`);

if (regressions.length) {
  const msg = `typecheck regression: ${regressions.join('; ')}`;
  if (blocking) {
    console.error(`::error::${msg}`);
    console.error('typecheck-report FAILED (blocking): error count grew above baseline.');
    process.exit(1);
  }
  console.log(`::warning::${msg} (report mode — not blocking)`);
} else {
  const improved =
    server < BASELINE.server || mail < BASELINE.mail
      ? ' (baseline can be lowered)'
      : '';
  console.log(`typecheck-report OK — no regression above baseline${improved}.`);
}
// Report mode always exits 0.
