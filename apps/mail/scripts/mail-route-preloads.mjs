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

/**
 * Injecte les modulepreloads manquants juste avant </head>. Idempotent :
 * les hrefs déjà présents sont ignorés ; sans </head>, HTML inchangé.
 * @param {string} html
 * @param {string[]} chunkNames
 */
export function injectMailRoutePreloads(html, chunkNames) {
  const existing = extractExistingPreloads(html);
  const missing = chunkNames.map((name) => `/assets/${name}`).filter((href) => !existing.has(href));
  if (missing.length === 0) return { html, injected: 0 };
  const headClose = html.indexOf('</head>');
  if (headClose === -1) return { html, injected: 0 };
  const tags = missing.map((href) => `<link rel="modulepreload" href="${href}"/>`).join('');
  return {
    html: html.slice(0, headClose) + tags + html.slice(headClose),
    injected: missing.length,
  };
}
