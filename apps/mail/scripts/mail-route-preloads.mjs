/**
 * Cœur PUR de l'injection des modulepreloads de la route mail (r10).
 *
 * Preuve statique du waterfall : le __spa-fallback.html (qui sert TOUS les
 * reloads /mail/*) ne précharge que l'entrée/root (~20 chunks) ; le module de
 * route (routes)/mail/[folder] et ses ~126 imports statiques (≈345 KiB gz)
 * ne sont découverts qu'APRÈS hydratation + résolution du routeur — une
 * cascade réseau sérialisée à 2 niveaux que Shortwave ne paie pas, et que la
 * session-prime r9 ne pouvait pas masquer (gain CUA nul, 4 runs ~2,1 s).
 *
 * Ici : fermeture transitive des imports STATIQUES depuis les chunks de la
 * route mail, injectée en <link rel="modulepreload"> dans le fallback. Aucun
 * octet supplémentaire — ces chunks seraient téléchargés de toute façon,
 * simplement plus tard et en série. Les imports DYNAMIQUES (composer, reader
 * lazy — gate #44) ne sont PAS dans la fermeture : ils restent lazy.
 *
 * Pur et testé par lib/mail-route-preloads.test.ts ; le CLI
 * inject-mail-preloads.mjs ne fait que lire le build et appliquer.
 */

/** Imports statiques d'un chunk Vite construit (`from"./x.js"` et `import"./x.js"`).
 * @param {string} source */
export function extractStaticImports(source) {
  const names = new Set();
  for (const match of source.matchAll(/from"\.\/([^"]+\.js)"/g)) names.add(match[1]);
  for (const match of source.matchAll(/import"\.\/([^"]+\.js)"/g)) names.add(match[1]);
  return [...names];
}

/**
 * Fermeture transitive des imports statiques depuis `entryChunks`.
 * `readChunk(name)` → source du chunk ou null s'il n'existe pas.
 * @param {string[]} entryChunks
 * @param {(name: string) => string | null} readChunk
 */
export function collectRouteChunks(entryChunks, readChunk) {
  const seen = new Set();
  const queue = [...entryChunks];
  while (queue.length > 0) {
    const name = /** @type {string} */ (queue.shift());
    if (seen.has(name)) continue;
    seen.add(name);
    const source = readChunk(name);
    if (source == null) continue;
    for (const child of extractStaticImports(source)) {
      if (!seen.has(child)) queue.push(child);
    }
  }
  return [...seen];
}

/** Modules de route mail (layout + [folder]) lus dans le manifest React Router.
 * @param {string} manifestSource */
export function extractMailRouteModules(manifestSource) {
  const modules = [];
  for (const match of manifestSource.matchAll(
    /"\(routes\)\/mail\/(?:layout|\[folder\]\/page)":\{[^}]*?"module":"\/assets\/([^"]+\.js)"/g,
  )) {
    modules.push(match[1]);
  }
  return modules;
}

/** hrefs déjà préchargés par le HTML (à ne pas dupliquer).
 * @param {string} html */
export function extractExistingPreloads(html) {
  const hrefs = new Set();
  for (const match of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) {
    hrefs.add(match[1]);
  }
  return hrefs;
}

/** Budgets DURS d'injection (r13) : au plus 10 preloads supplémentaires et
 * 90 KiB gzip au total — mesurés sur les liens réellement injectés (après
 * dédup avec le shell générique). Le cut-set du sélecteur est le POOL de
 * candidats ; l'injecteur applique la coupe finale dans l'ordre du sélecteur
 * (entrées de route d'abord). */
export const MAX_INJECTED_PRELOADS = 10;
export const MAX_INJECTED_GZIP_BYTES = 90 * 1024;

/**
 * Injecte les modulepreloads manquants juste avant </head>, sous budgets.
 * Idempotent : les hrefs déjà présents sont ignorés ; sans </head>, HTML
 * inchangé. Un chunk qui ferait dépasser le budget octets est SAUTÉ (un plus
 * petit suivant peut encore entrer).
 * @param {string} html
 * @param {string[]} chunkNames
 * @param {{ sizeOf?: (name: string) => number | null, maxCount?: number, maxTotalBytes?: number }} [limits]
 */
export function injectMailRoutePreloads(html, chunkNames, limits = {}) {
  const maxCount = limits.maxCount ?? MAX_INJECTED_PRELOADS;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_INJECTED_GZIP_BYTES;
  const sizeOf = limits.sizeOf ?? (() => 0);

  const existing = extractExistingPreloads(html);
  const missing = [];
  let injectedBytes = 0;
  for (const name of chunkNames) {
    const href = `/assets/${name}`;
    if (existing.has(href)) continue;
    if (missing.length >= maxCount) break;
    const size = sizeOf(name) ?? 0;
    if (injectedBytes + size > maxTotalBytes) continue;
    missing.push(href);
    injectedBytes += size;
  }
  if (missing.length === 0) return { html, injected: 0, injectedBytes: 0 };
  const headClose = html.indexOf('</head>');
  if (headClose === -1) return { html, injected: 0, injectedBytes: 0 };
  const tags = missing.map((href) => `<link rel="modulepreload" href="${href}"/>`).join('');
  return {
    html: html.slice(0, headClose) + tags + html.slice(headClose),
    injected: missing.length,
    injectedBytes,
  };
}

/**
 * r11 : cut-set CRITIQUE borné, pas la fermeture entière. Le shell r10
 * préchargeait 85 chunks (100 dans la fermeture) — tempête de requêtes +
 * parse qui a produit une variance CUA catastrophique (4845/4339 ms). Le
 * navigateur ne précharge PAS récursivement les dépendances d'un module
 * modulepreloadé de façon fiable ; on précharge donc les ENTRÉES de route
 * (toujours) plus leurs imports DIRECTS les plus lourds, sous un double
 * budget explicite : nombre total ≤ MAX_MAIL_PRELOADS, taille ≥
 * MIN_PRELOAD_BYTES (les petits chunks coûtent plus en requête qu'ils ne
 * rapportent). Niveau 2+ : jamais préchargé — découvert par le graphe module
 * normal, déjà recouvert par la RTT session et l'hydratation.
 */
export const MAX_MAIL_PRELOADS = 24;
export const MIN_PRELOAD_BYTES = 8 * 1024;

/**
 * @param {string[]} routeEntries — modules d'entrée de la route (toujours inclus)
 * @param {(name: string) => string | null} readChunk
 * @param {(name: string) => number | null} sizeOf — taille (octets) du chunk
 * @param {{ maxPreloads?: number, minBytes?: number }} [limits]
 */
export function selectMailPreloadChunks(routeEntries, readChunk, sizeOf, limits = {}) {
  const maxPreloads = limits.maxPreloads ?? MAX_MAIL_PRELOADS;
  const minBytes = limits.minBytes ?? MIN_PRELOAD_BYTES;
  const entries = [...new Set(routeEntries)];

  const directImports = new Set();
  for (const entry of entries) {
    const source = readChunk(entry);
    if (source == null) continue;
    for (const child of extractStaticImports(source)) {
      if (!entries.includes(child)) directImports.add(child);
    }
  }

  const ranked = [...directImports]
    .map((name) => ({ name, size: sizeOf(name) ?? 0 }))
    .filter((chunk) => chunk.size >= minBytes)
    // Déterministe : plus lourds d'abord (gain réseau/parse maximal par
    // requête), départage par nom.
    .sort((a, b) => b.size - a.size || (a.name < b.name ? -1 : 1))
    .slice(0, Math.max(0, maxPreloads - entries.length))
    .map((chunk) => chunk.name);

  return [...entries, ...ranked];
}
