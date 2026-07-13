#!/usr/bin/env node
// console-ratchet — A5 (Observabilité) non-growing ratchet on console.* usage.
//
// Runs the FROZEN grading-rubric A5 commands verbatim (docs/checks/niveau9/
// grading-rubric.md; product code only, tests + generated excluded):
//   server = grep -rE "console\." apps/server/src --include='*.ts'
//            --exclude='*.test.*' --exclude='*.d.ts' | wc -l
//   front  = grep -rE "console\." apps/mail/{app,components,lib,hooks,store}
//            --include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l
//
// Contract: NON-GROWING. Bornes = values MEASURED at job time (niveau9 baseline).
// Palier-8.5 targets (server <=20 / front <=40) are reached by A5 work lowering these.

import { execSync } from 'node:child_process';

// Measured with the frozen commands. `server` lowered 462 → 132 by V3.4
// server-runtime-guardrails (#29) — perimeter (all of apps/server/src except
// routes/agent/** and lib/driver/**) swept onto lib/logger.ts — then 132 → 87 by V5.6
// server-console-sweep (#42): lib/driver 45 → 0, then 87 → 8 by the #42 -02 pass
// (routes/agent 78 sites → logger after #36 unblocked the zone). The 8 residual is
// lib/logger.ts only (4 intentional sinks + 2 header comments) + 2 fully-commented
// dead lines in routes/agent/sync.ts. A5 ≤20 palier REACHED. Re-snapshots ordered by
// the right-critic at each #42 merge so gains are non-regainable. `front` left at its
// niveau9 baseline (owned by apps/mail jobs). NON-GROWING — never widen.
const BUDGET = { server: 8, front: 143 };

const SERVER_CMD =
  "grep -rE \"console\\.\" apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l";
const FRONT_CMD =
  'grep -rE "console\\." apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store ' +
  "--include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l";

function count(cmd) {
  const out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return Number(out.trim());
}

const server = count(SERVER_CMD);
const front = count(FRONT_CMD);

console.log(
  `console-ratchet: console(server)=${server}/${BUDGET.server}  console(front)=${front}/${BUDGET.front}`,
);

const failures = [];
if (server > BUDGET.server)
  failures.push(`console.* in server = ${server} > budget ${BUDGET.server}`);
if (front > BUDGET.front) failures.push(`console.* in front = ${front} > budget ${BUDGET.front}`);

if (failures.length) {
  console.error(`\nconsole-ratchet FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('console-ratchet PASSED (no regression).');
