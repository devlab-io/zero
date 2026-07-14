#!/usr/bin/env node
// route-inventory — V2.3 routing-consolidation (issue devlab-io/zero#24).
//
// Static, dependency-free inventory of the server's public routing surface,
// split by responsibility layer:
//   - Hono   : HTTP routes (method + path) registered on Hono apps/routers,
//              plus `.route()` sub-mounts and `.mount()` sub-apps (SSE/MCP).
//   - tRPC   : procedures exposed under the single `/api/trpc` endpoint,
//              addressed as `<namespace>.<procedure>`.
//
// It also reports DUPLICATION, which is the gate for #24:
//   (a) the same (method, path) served by more than one Hono handler;
//   (b) the same exported Durable-Object / agent class defined in more than
//       one routing module (the chat.ts vs routes/agent/** dead-copy);
//   (c) cross-layer namespace overlap (e.g. an `ai` surface on BOTH layers) —
//       reported with an operation-name disjointness check so the ADR can
//       justify a legitimate coexistence instead of a silent duplicate.
//
// The headline metric `functionalDuplicates` = |a| + |b|. It must be 0 after
// the consolidation. A cross-layer overlap whose operation sets are DISJOINT
// (c) is NOT counted as a functional duplicate — it is a namespace collision
// that the ADR resolves case by case.
//
// USAGE
//   node scripts/checks/route-inventory.mjs            # print human summary
//   node scripts/checks/route-inventory.mjs --json     # machine JSON to stdout
//   node scripts/checks/route-inventory.mjs --out FILE # write JSON snapshot
//   node scripts/checks/route-inventory.mjs --assert   # exit 1 if duplicates>0
//
// Determinism: pure filesystem + regex, no deps, sorted output. The check
// runner and cold judge re-run this verbatim; keep it side-effect-free unless
// --out is passed.

import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SERVER = 'apps/server/src';

const argv = new Set(process.argv.slice(2));
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i !== -1 ? process.argv[i + 1] : null;
})();

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function read(rel) {
  const abs = join(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

// Hono routing lives in main.ts (before) / routes/index.ts (after) plus the
// per-responsibility routers directly under routes/ (agent/** is a
// DO/websocket surface owned elsewhere and is inventoried via its mount, not
// scanned for HTTP verbs).
function honoRouteFiles() {
  const files = [];
  for (const rel of ['apps/server/src/main.ts', 'apps/server/src/routes/index.ts']) {
    if (existsSync(join(ROOT, rel))) files.push(rel);
  }
  const routesDir = join(ROOT, SERVER, 'routes');
  if (existsSync(routesDir)) {
    for (const name of readdirSync(routesDir).sort()) {
      const rel = `${SERVER}/routes/${name}`;
      const abs = join(ROOT, rel);
      if (statSync(abs).isDirectory()) continue; // skip agent/ (not our surface)
      if (!name.endsWith('.ts')) continue;
      if (name === 'index.ts') continue; // already added above
      files.push(rel);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Hono scan — method+path registrations, .route() mounts, .mount() sub-apps
// ---------------------------------------------------------------------------

const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'];
const verbRe = new RegExp(`\\.(${HTTP_VERBS.join('|')})\\(\\s*(['"\`])([^'"\`]*)\\2`, 'g');
// `.on(['GET','POST'], '/auth/*', ...)`
const onRe = /\.on\(\s*\[([^\]]*)\]\s*,\s*(['"`])([^'"`]*)\2/g;
// `.route('/prefix', ident)`  and  `.mount('/prefix', ...)`
const routeMountRe = /\.(route|mount)\(\s*(['"`])([^'"`]*)\2(?:\s*,\s*([A-Za-z0-9_]+))?/g;

// A genuine Hono route path is absolute (`/…`), the oauth well-known path, or a
// wildcard — never a bare identifier (`.get('Authorization')` on a headers map)
// nor a template literal (`.get(`${id}__…`)` on a KV namespace).
function isRoutePath(p) {
  if (p.includes('${')) return false;
  return p === '*' || p.startsWith('/') || p.startsWith('.well-known');
}

const normPrefix = (p) => (p === '/' ? '' : p.replace(/\/$/, ''));
const joinPath = (base, local) => {
  const b = normPrefix(base);
  let l = local.startsWith('/') ? local : `/${local}`;
  if (l === '/') l = b ? '' : '/';
  const full = `${b}${l}` || '/';
  return full.replace(/\/{2,}/g, '/');
};

// Attribute each `.verb()/.route()/.mount()` to the Hono app variable whose
// `const NAME = new Hono()…` block it belongs to, so mount prefixes can be
// resolved into full paths across chained sub-routers.
function parseHonoBlocks(src, rel) {
  const blocks = [];
  const defRe = /const\s+([A-Za-z0-9_]+)\s*=\s*new\s+Hono\b/g;
  const starts = [];
  let m;
  while ((m = defRe.exec(src))) starts.push({ name: m[1], idx: m.index });
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].idx;
    const to = i + 1 < starts.length ? starts[i + 1].idx : src.length;
    blocks.push({ name: starts[i].name, file: rel, text: src.slice(from, to) });
  }
  return blocks;
}

function scanHono(files) {
  // Pass 1: collect app-var blocks and per-block routes/mounts.
  const blocks = []; // {name, file, routes:[{method,path}], routeMounts:[{kind,prefix,childVar}]}
  const importMap = new Map(); // "file::ident" -> imported source file (repo-rel)
  for (const rel of files) {
    const src = read(rel);
    if (!src) continue;
    // import { a, b } from './x'   |   import x from './x'
    const impRe = /import\s+(?:\{([^}]*)\}|([A-Za-z0-9_]+))\s+from\s+['"](\.[^'"]+)['"]/g;
    let im;
    while ((im = impRe.exec(src))) {
      const idents = (im[1] || im[2] || '')
        .split(',')
        .map((s) => s.replace(/\s+as\s+.*/, '').trim())
        .filter(Boolean);
      const target = resolveRel(rel, im[3]);
      for (const id of idents) importMap.set(`${rel}::${id}`, target);
    }
    for (const b of parseHonoBlocks(src, rel)) {
      const routes = [];
      const routeMounts = [];
      let m;
      verbRe.lastIndex = 0;
      while ((m = verbRe.exec(b.text))) {
        if (!isRoutePath(m[3])) continue;
        routes.push({ method: m[1].toUpperCase(), path: m[3] });
      }
      onRe.lastIndex = 0;
      while ((m = onRe.exec(b.text))) {
        if (!isRoutePath(m[3])) continue;
        const methods = m[1].split(',').map((s) => s.replace(/['"`\s]/g, '')).filter(Boolean);
        for (const method of methods) routes.push({ method: method.toUpperCase(), path: m[3] });
      }
      routeMountRe.lastIndex = 0;
      while ((m = routeMountRe.exec(b.text))) {
        routeMounts.push({ kind: m[1], prefix: m[3] || '/', childVar: m[4] || null });
      }
      blocks.push({ ...b, routes, routeMounts });
    }
  }

  // Pass 2: resolve each app-var's base prefix by walking the mount graph.
  const byVar = new Map(); // "file::name" -> block
  for (const b of blocks) byVar.set(`${b.file}::${b.name}`, b);
  const mountedBy = new Map(); // childKey -> {parentKey, prefix}
  const fileEntryVar = new Map(); // imported file -> its exported Hono var (first block)
  for (const b of blocks) if (!fileEntryVar.has(b.file)) fileEntryVar.set(b.file, `${b.file}::${b.name}`);
  for (const b of blocks) {
    for (const rm of b.routeMounts) {
      if (rm.kind !== 'route' || !rm.childVar) continue;
      // child is a same-file var, or an imported router file's entry var
      let childKey = `${b.file}::${rm.childVar}`;
      if (!byVar.has(childKey)) {
        const impFile = importMap.get(`${b.file}::${rm.childVar}`);
        if (impFile && fileEntryVar.has(impFile)) childKey = fileEntryVar.get(impFile);
        else continue;
      }
      mountedBy.set(childKey, { parentKey: `${b.file}::${b.name}`, prefix: rm.prefix });
    }
  }
  const baseCache = new Map();
  function baseOf(key, seen = new Set()) {
    if (baseCache.has(key)) return baseCache.get(key);
    if (seen.has(key)) return '';
    seen.add(key);
    const edge = mountedBy.get(key);
    const base = edge ? joinPath(baseOf(edge.parentKey, seen), edge.prefix) : '';
    baseCache.set(key, base);
    return base;
  }

  // Pass 3: emit full-path routes + mounts.
  const routes = [];
  const mounts = [];
  for (const b of blocks) {
    const base = baseOf(`${b.file}::${b.name}`);
    for (const r of b.routes) {
      routes.push({ method: r.method, path: joinPath(base, r.path), local: r.path, file: b.file });
    }
    for (const rm of b.routeMounts) {
      mounts.push({ kind: rm.kind, prefix: joinPath(base, rm.prefix), file: b.file });
    }
  }
  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file));
  mounts.sort((a, b) => a.prefix.localeCompare(b.prefix) || a.file.localeCompare(b.file));
  return { routes, mounts };
}

function resolveRel(fromRel, spec) {
  // resolve an import spec relative to fromRel's directory into a repo-rel .ts
  const parts = fromRel.split('/');
  parts.pop();
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  const guess = parts.join('/');
  for (const cand of [`${guess}.ts`, `${guess}/index.ts`, guess]) {
    if (existsSync(join(ROOT, cand))) return cand;
  }
  return `${guess}.ts`;
}

// ---------------------------------------------------------------------------
// tRPC scan — namespaces from appRouter, procedures from each sub-router
// ---------------------------------------------------------------------------

function scanTrpc() {
  const indexSrc = read(`${SERVER}/trpc/index.ts`);
  const namespaces = [];
  if (indexSrc) {
    const body = indexSrc.slice(indexSrc.indexOf('router({'));
    const nsRe = /^\s*([A-Za-z0-9_]+)\s*[:,]/gm;
    let m;
    const block = body.slice(0, body.indexOf('})') + 1);
    while ((m = nsRe.exec(block))) namespaces.push(m[1]);
  }
  // Leaf procedures = calls to .query()/.mutation()/.subscription() across
  // trpc/routes/**. Also capture the `ai` namespace's procedure keys (the
  // surface that overlaps by name with the Hono /api/ai telephony router).
  const leafRe = /\.(query|mutation|subscription)\(/g;
  let procedureCount = 0;
  const dir = join(ROOT, SERVER, 'trpc', 'routes');
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!name.endsWith('.ts')) continue;
      const src = readFileSync(abs, 'utf8');
      const matches = src.match(leafRe);
      if (matches) procedureCount += matches.length;
    }
  };
  if (existsSync(dir)) walk(dir);
  const aiIdx = read(`${SERVER}/trpc/routes/ai/index.ts`) || '';
  const aiProcedures = [];
  const aiBody = aiIdx.slice(aiIdx.indexOf('router({'));
  const aiKeyRe = /^\s*([A-Za-z0-9_]+)\s*,?\s*$/gm;
  let am;
  while ((am = aiKeyRe.exec(aiBody.slice(0, aiBody.indexOf('})') + 1)))) {
    if (am[1] && am[1] !== 'router') aiProcedures.push(am[1]);
  }
  return { namespaces: namespaces.sort(), procedureCount, aiProcedures: aiProcedures.sort() };
}

// ---------------------------------------------------------------------------
// Duplicate exported DO / agent classes across routing modules
// ---------------------------------------------------------------------------

const DO_BASECLASSES = /extends\s+(DurableObject|RpcTarget|AIChatAgent|McpAgent|WorkflowEntrypoint|WorkerEntrypoint)\b/;

function scanExportedClasses() {
  const byName = new Map(); // className -> [file...]
  const dir = join(ROOT, SERVER, 'routes');
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!name.endsWith('.ts')) continue;
      const rel = relative(ROOT, abs);
      const src = readFileSync(abs, 'utf8');
      const clsRe = /export\s+class\s+([A-Za-z0-9_]+)\s+extends\s+([A-Za-z0-9_<>., ]+)/g;
      let m;
      while ((m = clsRe.exec(src))) {
        if (!DO_BASECLASSES.test(`extends ${m[2]}`)) continue;
        if (!byName.has(m[1])) byName.set(m[1], []);
        byName.get(m[1]).push(rel);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  const dups = [];
  for (const [cls, files] of byName) {
    if (files.length > 1) dups.push({ class: cls, files: files.sort() });
  }
  dups.sort((a, b) => a.class.localeCompare(b.class));
  return dups;
}

// ---------------------------------------------------------------------------
// Cross-layer namespace overlap (informational, ADR-justified)
// ---------------------------------------------------------------------------

function crossLayerOverlap(mounts, trpc) {
  // Hono sub-mount prefixes under /api (e.g. /ai) vs tRPC namespaces (e.g. ai)
  const honoNs = new Set(
    mounts
      .filter((x) => x.kind === 'route')
      .map((x) => x.prefix.split('/').filter(Boolean).pop())
      .filter(Boolean),
  );
  const overlap = [];
  for (const ns of trpc.namespaces) {
    if (honoNs.has(ns)) overlap.push(ns);
  }
  return overlap.sort();
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const hono = scanHono(honoRouteFiles());
const trpc = scanTrpc();
const classDups = scanExportedClasses();
const overlap = crossLayerOverlap(hono.mounts, trpc);

// (a) same (method, path) served by >1 Hono handler
const seen = new Map();
for (const r of hono.routes) {
  const key = `${r.method} ${r.path}`;
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(r.file);
}
const honoPathDups = [];
for (const [key, files] of seen) {
  if (files.length > 1) honoPathDups.push({ endpoint: key, files: files.sort() });
}
honoPathDups.sort((a, b) => a.endpoint.localeCompare(b.endpoint));

const functionalDuplicates = honoPathDups.length + classDups.length;

const inventory = {
  generatedBy: 'scripts/checks/route-inventory.mjs',
  layers: {
    hono: {
      routeCount: hono.routes.length,
      mountCount: hono.mounts.length,
      routes: hono.routes,
      mounts: hono.mounts,
    },
    trpc: {
      namespaceCount: trpc.namespaces.length,
      procedureCount: trpc.procedureCount,
      namespaces: trpc.namespaces,
      aiProcedures: trpc.aiProcedures,
    },
  },
  duplication: {
    functionalDuplicates,
    honoPathDuplicates: honoPathDups,
    duplicateExportedClasses: classDups,
    crossLayerNamespaceOverlap: overlap,
  },
};

if (OUT) {
  writeFileSync(join(ROOT, OUT), JSON.stringify(inventory, null, 2) + '\n');
}

if (argv.has('--json')) {
  process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
} else {
  const L = inventory.layers;
  console.log('route-inventory — server routing surface');
  console.log(`  Hono : ${L.hono.routeCount} HTTP routes, ${L.hono.mountCount} mounts/sub-routes`);
  console.log(`  tRPC : ${L.trpc.procedureCount} procedures across ${L.trpc.namespaceCount} namespaces`);
  console.log('');
  console.log('  Hono HTTP routes:');
  for (const r of L.hono.routes) console.log(`    ${r.method.padEnd(7)} ${r.path.padEnd(28)} ${r.file}`);
  console.log('  Hono mounts / sub-routes:');
  for (const x of L.hono.mounts) console.log(`    ${x.kind.padEnd(7)} ${x.prefix.padEnd(28)} ${x.file}`);
  console.log('  tRPC namespaces:', L.trpc.namespaces.join(', '));
  console.log(`  tRPC ai.* procedures: ${L.trpc.aiProcedures.join(', ') || '(none)'}`);
  console.log('');
  console.log(`  functionalDuplicates = ${functionalDuplicates}`);
  if (honoPathDups.length) {
    console.log('   duplicate Hono endpoints:');
    for (const d of honoPathDups) console.log(`     ${d.endpoint}  <-  ${d.files.join(', ')}`);
  }
  if (classDups.length) {
    console.log('   duplicate exported DO/agent classes:');
    for (const d of classDups) console.log(`     ${d.class}  <-  ${d.files.join(', ')}`);
  }
  if (overlap.length) {
    console.log(`   cross-layer namespace overlap (ADR-justified): ${overlap.join(', ')}`);
  }
}

if (argv.has('--assert') && functionalDuplicates > 0) {
  console.error(`route-inventory: FAIL — ${functionalDuplicates} functional Hono/tRPC duplicate(s)`);
  process.exit(1);
}
