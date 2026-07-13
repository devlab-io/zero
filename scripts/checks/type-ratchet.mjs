#!/usr/bin/env node
// type-ratchet — A2 (Type safety) non-growing ratchet on `any` usage.
//
// Runs the FROZEN grading-rubric A2 command verbatim (docs/checks/niveau9/
// grading-rubric.md) so the count matches the cold judge exactly:
//   grep -rE ":\s*any\b|as any|<any>|\bany\[\]" <paths>
//        --include='*.ts' --include='*.tsx' --exclude='*.d.ts' --exclude='*.test.*' | wc -l
//
// The frozen command spans mail dirs + server/src together; we run it once per
// scope (same regex + excludes) to hold the mail/server sub-budgets, plus the
// combined total as a cross-check.
//
// Contract: NON-GROWING. Bornes = values MEASURED at job time (niveau9 baseline).
// Palier-9 targets (mail <=25, server <=15) are reached by #20/#21 lowering these.

import { execSync } from 'node:child_process';

const MAIL_DIRS = 'apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store';
const SERVER_DIRS = 'apps/server/src';
const RE = ':\\s*any\\b|as any|<any>|\\bany\\[\\]';
const EXCLUDES = "--include='*.ts' --include='*.tsx' --exclude='*.d.ts' --exclude='*.test.*'";

// Measured 2026-07-12 with the frozen command.
// server tightened to the palier-9 target (<=15) by issue #21 (tsc-zero-server); the
// real post-job count is 14. mail/total remain at the niveau9 baseline (owned by #20).
const BUDGET = { mail: 79, server: 15, total: 170 };

function countAny(dirs) {
  const cmd = `grep -rE "${RE}" ${dirs} ${EXCLUDES} | wc -l`;
  const out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return Number(out.trim());
}

const mail = countAny(MAIL_DIRS);
const server = countAny(SERVER_DIRS);
const total = countAny(`${MAIL_DIRS} ${SERVER_DIRS}`);

console.log(`type-ratchet: any(mail)=${mail}/${BUDGET.mail}  any(server)=${server}/${BUDGET.server}  any(total)=${total}/${BUDGET.total}`);

const failures = [];
if (mail > BUDGET.mail) failures.push(`any in mail = ${mail} > budget ${BUDGET.mail}`);
if (server > BUDGET.server) failures.push(`any in server = ${server} > budget ${BUDGET.server}`);
if (total > BUDGET.total) failures.push(`any total = ${total} > budget ${BUDGET.total}`);

if (failures.length) {
  console.error(`\ntype-ratchet FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('type-ratchet PASSED (no regression).');
