#!/usr/bin/env node
// migrations-consistency — A6 (Données, migrations & config) gate.
//
// For each Drizzle migration directory, fails loudly on:
//   1. orphan SQL      — a *.sql file on disk with no matching journal entry
//   2. missing file    — a journal entry (tag) with no *.sql file on disk
//   3. duplicate prefix — two migrations sharing the same NNNN numeric prefix
// unless the specific item is documented in scripts/checks/migrations-allowlist.json.
//
// The tree carries a DURABLE, structural drift on the main DB (3 orphans + duplicate
// prefixes 0025/0029/0032/0035). Issue #19 established that this drift CANNOT be
// "removed": the absolute rule forbids deleting an applied .sql or renumbering a
// prefix, so the orphans and duplicate prefixes are permanent. #19 therefore does not
// empty the allowlist — it REDUCES it to the exact set of durable exceptions, each
// mapped to an anchored section of docs/solutions/migrations-drift.md. This script
// enforces that mapping: every allowlisted exception must reference a doc anchor that
// resolves, and any NEW drift beyond the allowlist fails the check with context.
//
// Allowlist entry forms (per category, per dir):
//   - referenced (preferred): { "<name>": "docs/solutions/migrations-drift.md#anchor" }
//   - legacy array (back-compat): [ "<name>", ... ]  // names only, no reference
// An ACTIVE exception (one the current tree actually relies on) with no resolvable
// reference fails the check — this is what keeps every remaining entry documented.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

// Normalize an allowlist category (array | object | undefined) into
// { names: Set<string>, refs: Map<name, refString|null> }.
const normalizeAllow = (field) => {
  const names = new Set();
  const refs = new Map();
  if (Array.isArray(field)) {
    for (const n of field) {
      names.add(n);
      refs.set(n, null);
    }
  } else if (field && typeof field === 'object') {
    for (const [n, ref] of Object.entries(field)) {
      names.add(n);
      refs.set(n, typeof ref === 'string' ? ref : null);
    }
  }
  return { names, refs };
};

// A reference "path/to/doc.md#anchor" resolves iff the file exists and, when an anchor
// is present, the file contains an `id="anchor"` marker (e.g. <a id="anchor"></a>).
// Returns null when resolvable, or a human string describing why it is not.
const refResolutionError = (ref) => {
  if (!ref) return 'no documentation reference';
  const [relPath, anchor] = ref.split('#');
  const absPath = join(REPO_ROOT, relPath);
  if (!existsSync(absPath)) return `referenced file not found: ${relPath}`;
  if (anchor) {
    const content = readFileSync(absPath, 'utf8');
    if (!content.includes(`id="${anchor}"`)) {
      return `anchor '#${anchor}' not found in ${relPath}`;
    }
  }
  return null;
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

  const allow = allowlist.allow?.[relDir] ?? {};
  const orphanAllow = normalizeAllow(allow.orphanSqlFiles);
  const missingAllow = normalizeAllow(allow.missingJournalFiles);
  const dupPrefixAllow = normalizeAllow(allow.duplicatePrefixes);

  // 1. orphan SQL files (on disk, not journalled)
  const orphans = sqlFiles.filter((f) => !journalTags.has(f));
  for (const o of orphans) {
    if (!orphanAllow.names.has(o)) failures.push(`[${relDir}] orphan SQL not journalled: ${o}.sql`);
  }

  // 2. journal entries with no SQL file
  const sqlSet = new Set(sqlFiles);
  const missing = [...journalTags].filter((t) => !sqlSet.has(t));
  for (const m of missing) {
    if (!missingAllow.names.has(m)) failures.push(`[${relDir}] journal entry has no SQL file: ${m}`);
  }

  // 3. duplicate numeric prefixes across the union of disk files + journal tags
  const byPrefix = new Map();
  for (const name of new Set([...sqlFiles, ...journalTags])) {
    const p = prefixOf(name);
    if (!p) continue;
    if (!byPrefix.has(p)) byPrefix.set(p, new Set());
    byPrefix.get(p).add(name);
  }
  const dupPrefixes = new Set();
  for (const [prefix, names] of byPrefix) {
    if (names.size <= 1) continue;
    dupPrefixes.add(prefix);
    if (!dupPrefixAllow.names.has(prefix)) {
      failures.push(`[${relDir}] duplicate prefix ${prefix}: ${[...names].sort().join(', ')}`);
    }
  }

  // 4. every ACTIVE allowlisted exception must carry a resolvable documentation reference.
  //    (An active exception is one the current tree relies on — orphan still present,
  //    missing file still missing, prefix still duplicated.)
  const active = [
    { cat: 'orphan', allow: orphanAllow, isActive: (n) => orphans.includes(n) },
    { cat: 'missing', allow: missingAllow, isActive: (n) => missing.includes(n) },
    { cat: 'duplicate-prefix', allow: dupPrefixAllow, isActive: (n) => dupPrefixes.has(n) },
  ];
  for (const { cat, allow: a, isActive } of active) {
    for (const [name, ref] of a.refs) {
      if (!isActive(name)) continue; // stale entries are reported below, not failed here
      const err = refResolutionError(ref);
      if (err) failures.push(`[${relDir}] ${cat} allowlist entry '${name}' — ${err}`);
    }
  }

  // Info: allowlist entries no longer needed (drift repaired) — can be pruned.
  for (const o of orphanAllow.names) if (!orphans.includes(o)) staleAllow.push(`[${relDir}] orphan '${o}' (resolved)`);
  for (const m of missingAllow.names) if (!missing.includes(m)) staleAllow.push(`[${relDir}] missing '${m}' (resolved)`);
  for (const p of dupPrefixAllow.names) if (!dupPrefixes.has(p)) staleAllow.push(`[${relDir}] dup-prefix '${p}' (resolved)`);

  console.log(
    `migrations-consistency [${relDir}]: ${sqlFiles.length} sql, ${journalTags.size} journalled, ` +
      `${orphans.length} orphan(s), ${missing.length} missing, ` +
      `${dupPrefixes.size} duplicate-prefix group(s)`,
  );
}

if (staleAllow.length) {
  console.log(`migrations-consistency: ${staleAllow.length} allowlist entr${staleAllow.length === 1 ? 'y' : 'ies'} prunable (info):`);
  for (const s of staleAllow) console.log(`  - ${s}`);
}

if (failures.length) {
  console.error(`\nmigrations-consistency FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('migrations-consistency PASSED (drift within documented allowlist).');
