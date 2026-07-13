#!/usr/bin/env node
// loc-ratchet — A1 (Frontières & modularité) non-growing ratchet.
//
// Runs the FROZEN grading-rubric A1 commands verbatim (docs/checks/niveau9/
// grading-rubric.md) so the counting contract matches the cold judge exactly:
//   LOC      = find apps/mail/{app,components,lib,hooks,store} apps/server/src
//              ( -name '*.ts' -o -name '*.tsx' ) ! -name '*.d.ts' ! -name '*.test.*'
//              -exec wc -l {} + | sort -rn | head -30
//   frontier = grep -rnE "(\.\./)+server/src" apps/mail --include='*.ts' --include='*.tsx'
//
// Contract: NON-GROWING. Every source file over THRESHOLD LOC must be budgeted
// with count <= its budget; a new over-threshold file, or an existing one that
// grew, fails. The cross-app frontier import count must not exceed FRONTIER_MAX.
//
// Bornes = values MEASURED at job time (niveau9 baseline). Reductions toward the
// palier-9 targets (<=6 exceptions >800) are tracked by #20/#21, which prune this
// map as files shrink. `lib/driver/microsoft.ts` is covered by the driver ADR.

import { execSync } from 'node:child_process';

const THRESHOLD = 800; // palier-9 line; every source file above it must be budgeted
// V2.4 shared-types-package (issue #25) : les 5 imports relatifs `../server/src` ont
// été remplacés par `@zero/types` (contrats partagés). Borne resserrée 5 -> 0 ;
// toute réapparition d'un import de source serveur en relatif dans apps/mail = rouge.
const FRONTIER_MAX = 0;

// path -> measured LOC (ceiling). Full list of files > THRESHOLD at baseline.
const BUDGET = {
  // agent/index.ts (2274 -> 25, barrel — issue #22 mergée) : entrée prunée.
  // re-snapshot orchestrateur 2026-07-13 (ruling #13/#23) : +9 par merges jugés PASS
  // (typing #20, quick wins perf) ; le fichier appartient à #28 qui le fera fondre.
  'apps/mail/components/context/command-palette-context.tsx': 1922,
  // icons.tsx (1783 -> 10, barrel de familles — issue #41 mergée) : entrée prunée.
  'apps/mail/components/mail/mail-display.tsx': 1736,
  // chat.ts (supprimé, code mort — issue #24 mergée) : entrée prunée.
  // google.ts retiré (1487 -> 155, façade — issue #23 mergée) : entrée prunée.
  'apps/mail/components/home/HomeContent.tsx': 1332,
  'apps/server/src/lib/driver/microsoft.ts': 1294, // ADR: driver Microsoft
  // main.ts (1261 -> 333, montages — issue #24 mergée) : entrée prunée.
  'apps/mail/components/create/email-composer.tsx': 1170,
  'apps/mail/components/mail/mail-list.tsx': 1111,
  'apps/mail/components/mail/thread-display.tsx': 1062,
  // contributors.tsx (1040 -> 756, données+fetch extraits vers contributors-data.ts —
  // issue #41 mergée) : entrée prunée.
  'apps/server/src/trpc/routes/mail.ts': 879,
  'apps/server/src/pipelines.ts': 873,
  'apps/mail/components/mail/mail.tsx': 852,
  // note-panel.tsx (829 -> 399, vue/logique séparées — issue #41 mergée) : entrée prunée.
};

const LOC_CMD =
  "find apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src " +
  "\\( -name '*.ts' -o -name '*.tsx' \\) ! -name '*.d.ts' ! -name '*.test.*' -exec wc -l {} +";
const FRONTIER_CMD =
  "grep -rnE \"(\\.\\./)+server/src\" apps/mail --include='*.ts' --include='*.tsx' || true";

function sh(cmd) {
  return execSync(cmd, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// --- LOC ---
const locOut = sh(LOC_CMD);
const measured = new Map();
for (const line of locOut.split('\n')) {
  const m = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
  if (!m) continue;
  const count = Number(m[1]);
  const file = m[2];
  if (file === 'total') continue;
  measured.set(file, count);
}

const failures = [];
for (const [file, loc] of measured) {
  if (loc <= THRESHOLD) continue;
  if (!(file in BUDGET)) {
    failures.push(`NEW file over ${THRESHOLD} LOC not budgeted: ${file} (${loc} LOC)`);
  } else if (loc > BUDGET[file]) {
    failures.push(`GREW past budget: ${file} = ${loc} LOC > budget ${BUDGET[file]}`);
  }
}

// Info: budget entries that have dropped to/below THRESHOLD or vanished — safe to
// prune (a shrink is allowed; this only tells #20/#21 the list can get smaller).
const stale = [];
for (const file of Object.keys(BUDGET)) {
  const loc = measured.get(file);
  if (loc === undefined) stale.push(`${file} (no longer present)`);
  else if (loc <= THRESHOLD) stale.push(`${file} (now ${loc} <= ${THRESHOLD})`);
}

// --- frontier ---
const frontierOut = sh(FRONTIER_CMD).trim();
const frontierCount = frontierOut === '' ? 0 : frontierOut.split('\n').length;
if (frontierCount > FRONTIER_MAX) {
  failures.push(
    `cross-app frontier imports (\\.\\./+server/src in apps/mail) = ${frontierCount} > ${FRONTIER_MAX}`,
  );
}

// --- report ---
const overThreshold = [...measured.values()].filter((n) => n > THRESHOLD).length;
console.log(`loc-ratchet: files > ${THRESHOLD} LOC = ${overThreshold} (budget entries ${Object.keys(BUDGET).length})`);
console.log(`loc-ratchet: cross-app frontier imports = ${frontierCount} (max ${FRONTIER_MAX})`);
if (stale.length) {
  console.log(`loc-ratchet: ${stale.length} budget entr${stale.length === 1 ? 'y' : 'ies'} prunable (info):`);
  for (const s of stale) console.log(`  - ${s}`);
}

if (failures.length) {
  console.error(`\nloc-ratchet FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('loc-ratchet PASSED (no regression).');
