/**
 * Post-build r10 : produit __mail-spa-fallback.html — copie du shell SPA
 * générique ENRICHIE des modulepreloads du graphe de la route mail. Le shell
 * générique __spa-fallback.html reste INTACT : le Worker le sert pour /login,
 * /settings/* et toute autre navigation deep-link — y injecter ~126 chunks
 * mail aurait alourdi ces routes (contre-revue r10). Le Worker choisit le
 * shell par pathname (/mail/* → shell mail). index.html (landing) n'est pas
 * touché non plus. Voir mail-route-preloads.mjs pour la preuve du waterfall.
 */
import {
  collectRouteChunks,
  extractMailRouteModules,
  injectMailRoutePreloads,
} from './mail-route-preloads.mjs';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'client');
const assetsDir = join(clientDir, 'assets');
const fallbackPath = join(clientDir, '__spa-fallback.html');
const mailFallbackPath = join(clientDir, '__mail-spa-fallback.html');

if (!existsSync(fallbackPath) || !existsSync(assetsDir)) {
  console.error('[inject-mail-preloads] build/client absent — lancer react-router build d’abord.');
  process.exit(1);
}

const manifestName = readdirSync(assetsDir).find((name) => /^manifest-.*\.js$/.test(name));
if (!manifestName) {
  console.error('[inject-mail-preloads] manifest React Router introuvable.');
  process.exit(1);
}

const routeModules = extractMailRouteModules(readFileSync(join(assetsDir, manifestName), 'utf8'));
if (routeModules.length === 0) {
  console.error('[inject-mail-preloads] modules de route mail introuvables dans le manifest.');
  process.exit(1);
}

const chunks = collectRouteChunks(routeModules, (name) => {
  const path = join(assetsDir, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
});

const html = readFileSync(fallbackPath, 'utf8');
const { html: injected, injected: count } = injectMailRoutePreloads(html, chunks);
writeFileSync(mailFallbackPath, injected);
console.log(
  `[inject-mail-preloads] __mail-spa-fallback.html écrit : ${count} modulepreloads (graphe route mail : ${chunks.length} chunks) — __spa-fallback.html générique intact.`,
);
