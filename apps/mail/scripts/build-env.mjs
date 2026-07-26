#!/usr/bin/env node
// build-env.mjs — construit le front avec les VITE_PUBLIC_* de l'environnement visé, puis
// vérifie que rien de local n'a été embarqué (pitbull A12, axe 10).
//
// Le piège corrigé ici : `wrangler.jsonc` déclare bien `VITE_PUBLIC_BACKEND_URL` et
// `VITE_PUBLIC_APP_URL` par environnement, mais ce sont des variables RUNTIME du Worker.
// Vite, lui, inline `import.meta.env.VITE_PUBLIC_*` AU BUILD, en les lisant dans
// `apps/mail/.env` — un fichier gitignoré, local à chaque machine, qui pointe sur
// `http://localhost:8787`. Un `pnpm build` fait sur un poste de développement produisait donc
// un bundle de production appelant localhost, sans qu'aucune étape ne s'en aperçoive.
//
// Une seule source de vérité : les valeurs sont LUES dans wrangler.jsonc plutôt que recopiées
// ici, pour qu'elles ne puissent pas diverger.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetEnv = process.argv[2];

if (!['local', 'staging', 'production'].includes(targetEnv ?? '')) {
  console.error('usage: node scripts/build-env.mjs <local|staging|production>');
  process.exit(1);
}

/** wrangler.jsonc est du JSONC : on retire les commentaires et les virgules traînantes. */
function readWranglerConfig() {
  const raw = readFileSync(join(appDir, 'wrangler.jsonc'), 'utf8');
  const withoutComments = raw.replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(withoutComments.replace(/,(\s*[}\]])/g, '$1'));
}

const config = readWranglerConfig();
const vars = config?.env?.[targetEnv]?.vars;

if (!vars?.VITE_PUBLIC_BACKEND_URL || !vars?.VITE_PUBLIC_APP_URL) {
  console.error(
    `[build-env] FAILED: env.${targetEnv}.vars doit porter VITE_PUBLIC_BACKEND_URL et VITE_PUBLIC_APP_URL dans wrangler.jsonc.`,
  );
  process.exit(1);
}

console.log(`[build-env] ${targetEnv}: backend=${vars.VITE_PUBLIC_BACKEND_URL}`);

execFileSync('pnpm', ['exec', 'react-router', 'build'], {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_PUBLIC_BACKEND_URL: vars.VITE_PUBLIC_BACKEND_URL,
    VITE_PUBLIC_APP_URL: vars.VITE_PUBLIC_APP_URL,
  },
});

if (targetEnv === 'local') process.exit(0);

// Garde de sortie. Elle est volontairement PRÉCISE : chercher la chaîne « localhost » à
// l'aveugle produit des faux positifs — le client `autumn-js` embarque son défaut
// `http://localhost:8000` et React Router une base `http://localhost` pour parser une URL
// sans `window`. Ni l'un ni l'autre n'est notre configuration. On vérifie donc deux choses
// exactes : que l'URL attendue a bien été inlinée, et qu'aucune des valeurs de
// l'environnement LOCAL ne s'est retrouvée dans l'artefact.
const localVars = config?.env?.local?.vars ?? {};
const assetsDir = join(appDir, 'build/client/assets');

const assets = readdirSync(assetsDir)
  .filter((name) => /\.(js|css)$/.test(name) && statSync(join(assetsDir, name)).isFile())
  .map((name) => ({ name, content: readFileSync(join(assetsDir, name), 'utf8') }));

const expected = vars.VITE_PUBLIC_BACKEND_URL;
if (!assets.some((asset) => asset.content.includes(expected))) {
  console.error(
    `[build-env] FAILED: l'URL backend attendue (${expected}) n'apparait dans aucun asset — ` +
      "elle n'a donc pas ete inlinee par Vite.",
  );
  process.exit(1);
}

const leaks = [];
for (const [key, localValue] of Object.entries(localVars)) {
  if (!localValue || vars[key] === localValue) continue;
  for (const asset of assets) {
    if (asset.content.includes(localValue)) leaks.push(`${key}=${localValue} dans ${asset.name}`);
  }
}

if (leaks.length) {
  console.error(`[build-env] FAILED: l'artefact ${targetEnv} porte des valeurs de l'env local :`);
  for (const leak of leaks.slice(0, 10)) console.error('  - ' + leak);
  console.error(
    '  Cause probable : une valeur VITE_PUBLIC_* lue depuis apps/mail/.env a ete inlinee au build.',
  );
  process.exit(1);
}

console.log(
  `[build-env] ${targetEnv}: URL backend inlinee et verifiee, aucune valeur de l'env local dans l'artefact.`,
);
