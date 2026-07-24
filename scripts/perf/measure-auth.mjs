#!/usr/bin/env node
/**
 * Mesure du chemin authentifié (axes 3/4/6/9) sans navigateur.
 *
 * Appelle directement les procédures tRPC du Worker staging avec le cookie de
 * session, comme le ferait httpBatchLink (GET, transformer superjson).
 *
 * Usage :
 *   ZERO_SESSION_COOKIE='__Secure-better-auth-dev.session_token=…' \
 *     node scripts/perf/measure-auth.mjs [--runs 12] [--base https://…]
 *
 * Le cookie peut aussi être posé dans un fichier `.perf-cookie` à la racine
 * (ignoré par git). Aucune écriture : toutes les procédures sollicitées sont
 * des queries en lecture.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_BASE = 'https://zero-server-staging.devlab-tahiti.workers.dev';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const BASE = arg('base', process.env.ZERO_BACKEND_URL || DEFAULT_BASE);
const RUNS = Number(arg('runs', '12'));
const FOLDER = arg('folder', 'inbox');

const cookieFile = join(process.cwd(), '.perf-cookie');
const rawCookie =
  process.env.ZERO_SESSION_COOKIE ||
  (existsSync(cookieFile) ? readFileSync(cookieFile, 'utf8').trim() : '');

if (!rawCookie) {
  console.error(
    'Cookie de session absent. Renseigner ZERO_SESSION_COOKIE ou créer .perf-cookie\n' +
      "Valeur attendue : le contenu du cookie '__Secure-better-auth-dev.session_token'\n" +
      "(DevTools → Application → Cookies), sous la forme 'nom=valeur'.",
  );
  process.exit(2);
}

// Tolère qu'on colle uniquement la valeur, sans le nom du cookie.
const COOKIE = rawCookie.includes('=')
  ? rawCookie
  : `__Secure-better-auth-dev.session_token=${rawCookie}`;

const quantile = (sorted, q) => {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const stats = (samples) => {
  const s = [...samples].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0],
    p50: quantile(s, 0.5),
    p95: quantile(s, 0.95),
    max: s[s.length - 1],
  };
};

const ms = (v) => (Number.isFinite(v) ? `${Math.round(v)} ms` : '—');

/** Encode l'input comme httpBatchLink + superjson : {"0":{"json":{…}}} */
const encodeInput = (input) => encodeURIComponent(JSON.stringify({ 0: { json: input } }));

async function call(procedure, input) {
  const url = `${BASE}/api/trpc/${procedure}?batch=1&input=${encodeInput(input)}`;
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: {
      cookie: COOKIE,
      accept: 'application/json',
      'accept-encoding': 'gzip, br',
      'user-agent': 'zero-perf-harness',
    },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const durationMs = performance.now() - t0;
  let body = null;
  try {
    body = JSON.parse(buf.toString('utf8'));
  } catch {
    /* réponse non JSON : conservée telle quelle pour le diagnostic */
  }
  return { durationMs, status: res.status, bytes: buf.byteLength, body, raw: buf };
}

const unwrap = (body) => body?.[0]?.result?.data?.json ?? null;

const errorOf = (body) => body?.[0]?.error?.json?.message ?? body?.[0]?.error?.message ?? null;

async function main() {
  console.log(`Base       : ${BASE}`);
  console.log(`Itérations : ${RUNS}`);
  console.log(`Dossier    : ${FOLDER}\n`);

  // --- Sonde d'authentification ------------------------------------------
  const probe = await call('mail.listThreads', { folder: FOLDER, maxResults: 20 });
  if (probe.status !== 200 || errorOf(probe.body)) {
    console.error(`Échec d'authentification (HTTP ${probe.status}).`);
    console.error(errorOf(probe.body) ?? probe.raw.toString('utf8').slice(0, 400));
    process.exit(1);
  }
  const firstPage = unwrap(probe.body);
  const threadIds = (firstPage?.threads ?? []).map((t) => t.id).filter(Boolean);
  console.log(
    `Session valide — ${threadIds.length} fils sur la première page, ` +
      `${probe.bytes} o de réponse, ${ms(probe.durationMs)} (appel de chauffe)\n`,
  );

  // --- C2 : listThreads à chaud ------------------------------------------
  const listSamples = [];
  let listBytes = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = await call('mail.listThreads', { folder: FOLDER, maxResults: 20 });
    if (r.status !== 200) {
      console.error(`listThreads HTTP ${r.status} à l'itération ${i}`);
      break;
    }
    listSamples.push(r.durationMs);
    listBytes = r.bytes;
  }
  const list = stats(listSamples);
  console.log('C2 — mail.listThreads (chaud, cible < 500 ms)');
  console.log(
    `   p50 ${ms(list.p50)} · p95 ${ms(list.p95)} · min ${ms(list.min)} · ` +
      `max ${ms(list.max)} · ${listBytes} o · n=${list.n}`,
  );

  // --- C4 : openThread ----------------------------------------------------
  if (threadIds.length === 0) {
    console.log('\nC4 — aucun fil disponible, ouverture non mesurée.');
  } else {
    // Froid relatif : un fil différent à chaque itération (cache DO non peuplé).
    const coldSamples = [];
    const coldTargets = threadIds.slice(0, Math.min(RUNS, threadIds.length));
    for (const id of coldTargets) {
      const r = await call('mail.openThread', { id });
      if (r.status === 200) coldSamples.push(r.durationMs);
    }
    const cold = stats(coldSamples);
    console.log('\nC4 — mail.openThread, première ouverture (cible < 1 000 ms)');
    console.log(
      `   p50 ${ms(cold.p50)} · p95 ${ms(cold.p95)} · min ${ms(cold.min)} · ` +
        `max ${ms(cold.max)} · n=${cold.n}`,
    );

    // Chaud : le même fil, cache DO 60 s peuplé.
    const warmId = threadIds[0];
    const warmSamples = [];
    let warmBytes = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = await call('mail.openThread', { id: warmId });
      if (r.status === 200) {
        warmSamples.push(r.durationMs);
        warmBytes = r.bytes;
      }
    }
    const warm = stats(warmSamples);
    console.log('\nAxe 6 — mail.openThread, réouverture (cache DO chaud)');
    console.log(
      `   p50 ${ms(warm.p50)} · p95 ${ms(warm.p95)} · min ${ms(warm.min)} · ` +
        `max ${ms(warm.max)} · ${warmBytes} o · n=${warm.n}`,
    );
  }

  // --- Axe 9 : TTFB des procédures légères -------------------------------
  // Échelle des couches d'authentification : public → privé → driver actif.
  // L'écart entre les trois isole le coût de la session et de la connexion.
  const light = [
    ['settings.get', {}],
    ['connections.list', {}],
    ['mail.getEmailAliases', {}],
  ];
  console.log('\nAxe 9 — coût des couches (public → privé → driver actif)');
  for (const [procedure, input] of light) {
    const samples = [];
    let status = 0;
    for (let i = 0; i < Math.min(RUNS, 6); i++) {
      const r = await call(procedure, input);
      status = r.status;
      if (r.status === 200) samples.push(r.durationMs);
    }
    const s = stats(samples);
    console.log(
      samples.length
        ? `   ${procedure.padEnd(20)} p50 ${ms(s.p50)} · p95 ${ms(s.p95)} · n=${s.n}`
        : `   ${procedure.padEnd(20)} indisponible (HTTP ${status})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
