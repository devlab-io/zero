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

// Measured 2026-07-12 with the frozen commands.
const BUDGET = { server: 462, front: 143 };

const SERVER_CMD =
  "grep -rE \"console\\.\" apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l";
const FRONT_CMD =
  "grep -rE \"console\\.\" apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store " +
  "--include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l";

function count(cmd) {
  const out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return Number(out.trim());
}

const server = count(SERVER_CMD);
const front = count(FRONT_CMD);

console.log(`console-ratchet: console(server)=${server}/${BUDGET.server}  console(front)=${front}/${BUDGET.front}`);

const failures = [];
if (server > BUDGET.server) failures.push(`console.* in server = ${server} > budget ${BUDGET.server}`);
if (front > BUDGET.front) failures.push(`console.* in front = ${front} > budget ${BUDGET.front}`);

if (failures.length) {
  console.error(`\nconsole-ratchet FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('console-ratchet PASSED (no regression).');
