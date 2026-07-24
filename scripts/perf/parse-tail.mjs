#!/usr/bin/env node
/**
 * Dépouille une capture `wrangler tail --format json`.
 *
 * Le flux n'est PAS du JSONL : ce sont des objets JSON indentés, concaténés.
 * Ce parseur les recompose par comptage d'accolades (hors chaînes), puis rend
 * les médianes par procédure tRPC à partir des lignes `trpc.call` du sink
 * console, ainsi que le temps CPU et l'issue par requête.
 *
 * Usage : node scripts/perf/parse-tail.mjs /tmp/zero-tail.json
 */

import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage : node scripts/perf/parse-tail.mjs <capture.json>');
  process.exit(2);
}

/** Recompose les objets JSON concaténés d'une capture wrangler tail. */
export function splitConcatenatedJson(raw) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          objects.push(JSON.parse(raw.slice(start, i + 1)));
        } catch {
          /* objet tronqué en fin de capture */
        }
        start = -1;
      }
    }
  }
  return objects;
}

const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '—');

const events = splitConcatenatedJson(readFileSync(path, 'utf8'));

// --- Lignes trpc.call du sink console ------------------------------------
const byProcedure = new Map();
let errorCalls = 0;

for (const event of events) {
  for (const entry of event.logs ?? []) {
    for (const part of Array.isArray(entry.message) ? entry.message : [entry.message]) {
      if (typeof part !== 'string' || !part.includes('trpc.call')) continue;
      let parsed;
      try {
        parsed = JSON.parse(part);
      } catch {
        continue;
      }
      const payload = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
      if (!payload?.procedure) continue;
      if (payload.error) errorCalls++;
      const list = byProcedure.get(payload.procedure) ?? [];
      list.push(payload.durationMs);
      byProcedure.set(payload.procedure, list);
    }
  }
}

// --- Requêtes HTTP -------------------------------------------------------
const requests = events.filter((e) => e.event?.request?.method);
const nonOk = requests.filter((e) => e.outcome && e.outcome !== 'ok');
const exceptions = events.flatMap((e) => e.exceptions ?? []);
const cpuTimes = requests.map((e) => e.cpuTime).filter((v) => typeof v === 'number' && v > 0);

console.log(`Événements : ${events.length} · requêtes : ${requests.length}`);
console.log(`Issues non-ok : ${nonOk.length} · exceptions : ${exceptions.length}`);
if (cpuTimes.length) {
  const s = cpuTimes.sort((a, b) => a - b);
  console.log(
    `CPU par requête : p50 ${fmt(quantile(s, 0.5))} ms · p95 ${fmt(quantile(s, 0.95))} ms`,
  );
}

if (byProcedure.size === 0) {
  console.log('\nAucune ligne trpc.call dans la capture.');
} else {
  console.log(`\nProcédures tRPC (durée serveur, ms) — ${errorCalls} appel(s) en erreur`);
  const rows = [...byProcedure.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [procedure, samples] of rows) {
    const s = samples.sort((a, b) => a - b);
    console.log(
      `  ${procedure.padEnd(26)} n=${String(s.length).padStart(3)} · ` +
        `p50 ${fmt(quantile(s, 0.5)).padStart(5)} · p95 ${fmt(quantile(s, 0.95)).padStart(5)} · ` +
        `min ${fmt(s[0]).padStart(4)} · max ${fmt(s[s.length - 1]).padStart(5)}`,
    );
  }
}

for (const exception of exceptions.slice(0, 5)) {
  console.log(`\nEXCEPTION : ${exception.name ?? ''} ${exception.message ?? ''}`);
}
