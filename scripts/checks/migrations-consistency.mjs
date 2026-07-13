#!/usr/bin/env node
// migrations-consistency — A6 (Données, migrations & config) gate.
//
// For each Drizzle migration directory, fails loudly on:
//   1. orphan SQL      — a *.sql file on disk with no matching journal entry
//   2. missing file    — a journal entry (tag) with no *.sql file on disk
//   3. duplicate prefix — two migrations sharing the same NNNN numeric prefix
// unless the specific item is documented in scripts/checks/migrations-allowlist.json.
//
// The current tree has a KNOWN drift (3 orphans + duplicate prefixes on the main
// DB) whose repair is issue #19, NOT this job — hence the pre-filled allowlist.
// #19 empties the allowlist once the drift is fixed. Any NEW drift beyond the
// allowlist fails the check with context.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const MIGRATION_DIRS = [
  'apps/server/src/db/migrations',
  'apps/server/src/routes/agent/db/drizzle',
];

const allowlist = JSON.parse(readFileSync(join(HERE, 'migrations-allowlist.json'), 'utf8'));

const prefixOf = (name) => {
  const m = name.match(/^(\d+)/);
  return m ? m[1] : null;
};

const failures = [];
const staleAllow = [];

for (const relDir of MIGRATION_DIRS) {
  const absDir = join(REPO_ROOT, relDir);
  const journalPath = join(absDir, 'meta', '_journal.json');

  let journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  } catch (err) {
    failures.push(`[${relDir}] cannot read journal ${journalPath}: ${err.message}`);
    continue;
  }

  const journalTags = new Set((journal.entries ?? []).map((e) => e.tag));
  const sqlFiles = readdirSync(absDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.slice(0, -'.sql'.length));

  const allow = allowlist.allow?.[relDir] ?? {
    orphanSqlFiles: [],
    missingJournalFiles: [],
    duplicatePrefixes: [],
  };
  const allowOrphans = new Set(allow.orphanSqlFiles ?? []);
  const allowMissing = new Set(allow.missingJournalFiles ?? []);
  const allowDupPrefix = new Set(allow.duplicatePrefixes ?? []);

  // 1. orphan SQL files (on disk, not journalled)
  const orphans = sqlFiles.filter((f) => !journalTags.has(f));
  for (const o of orphans) {
    if (!allowOrphans.has(o)) failures.push(`[${relDir}] orphan SQL not journalled: ${o}.sql`);
  }

  // 2. journal entries with no SQL file
  const sqlSet = new Set(sqlFiles);
  const missing = [...journalTags].filter((t) => !sqlSet.has(t));
  for (const m of missing) {
    if (!allowMissing.has(m)) failures.push(`[${relDir}] journal entry has no SQL file: ${m}`);
  }

  // 3. duplicate numeric prefixes across the union of disk files + journal tags
  const byPrefix = new Map();
  for (const name of new Set([...sqlFiles, ...journalTags])) {
    const p = prefixOf(name);
    if (!p) continue;
    if (!byPrefix.has(p)) byPrefix.set(p, new Set());
    byPrefix.get(p).add(name);
  }
  for (const [prefix, names] of byPrefix) {
    if (names.size <= 1) continue;
    if (!allowDupPrefix.has(prefix)) {
      failures.push(`[${relDir}] duplicate prefix ${prefix}: ${[...names].sort().join(', ')}`);
    }
  }

  // Info: allowlist entries no longer needed (drift repaired) — #19 can prune them.
  for (const o of allowOrphans) if (!orphans.includes(o)) staleAllow.push(`[${relDir}] orphan '${o}' (resolved)`);
  for (const m of allowMissing) if (!missing.includes(m)) staleAllow.push(`[${relDir}] missing '${m}' (resolved)`);
  for (const p of allowDupPrefix) {
    const names = byPrefix.get(p);
    if (!names || names.size <= 1) staleAllow.push(`[${relDir}] dup-prefix '${p}' (resolved)`);
  }

  console.log(
    `migrations-consistency [${relDir}]: ${sqlFiles.length} sql, ${journalTags.size} journalled, ` +
      `${orphans.length} orphan(s), ${missing.length} missing, ` +
      `${[...byPrefix.values()].filter((s) => s.size > 1).length} duplicate-prefix group(s)`,
  );
}

if (staleAllow.length) {
  console.log(`migrations-consistency: ${staleAllow.length} allowlist entr${staleAllow.length === 1 ? 'y' : 'ies'} prunable (info, for #19):`);
  for (const s of staleAllow) console.log(`  - ${s}`);
}

if (failures.length) {
  console.error(`\nmigrations-consistency FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('migrations-consistency PASSED (drift within documented allowlist).');
