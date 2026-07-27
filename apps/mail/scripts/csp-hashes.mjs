#!/usr/bin/env node
// csp-hashes.mjs — extraction des scripts inline des artefacts de build et calcul de leurs
// empreintes CSP (`sha256-…`), pour que `script-src` puisse se passer de `'unsafe-inline'`.
//
// POURQUOI. Le shell prérendu (build/client/index.html, __spa-fallback.html,
// manifest.webmanifest/index.html) embarque une dizaine de <script> inline non noncés, émis par
// le framework et non par le code applicatif : l'anti-flash de thème (next-themes), la
// restauration de défilement et le bootstrap d'hydratation de React Router, le révélateur de
// Suspense de React DOM, et le script de rééquilibrage de react-wrap-balancer. Tant que la CSP
// portait `'unsafe-inline'`, toute injection de balisage dans le DOM s'exécutait — trois XSS
// stockés l'ont démontré. Les empreintes remplacent ce laissez-passer par une liste close.
//
// POURQUOI PAS UNE LISTE ÉCRITE À LA MAIN. Deux des scripts inline changent à chaque build :
// le bootstrap d'hydratation cite les noms de chunks (`/assets/root-LuohFImE.js`), qui dépendent
// du contenu — donc de `VITE_PUBLIC_BACKEND_URL`, différent entre staging et production — et le
// script de react-wrap-balancer cite un `useId` React qui suit la forme de l'arbre. Une liste
// figée se désynchroniserait au premier changement, sans bruit, et la CSP casserait l'hydratation
// en production. Le calcul est donc fait À CHAQUE BUILD, à partir des octets réellement produits.
//
// Ce module est la SEULE implémentation de l'extraction : le générateur (ci-dessous, exécuté en
// fin de build) et le contrôle de couverture (scripts/checks/csp-inline-scripts.mjs) l'importent
// tous les deux, pour qu'ils ne puissent pas diverger dans leur lecture du HTML.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Répertoire des assets client produits par `react-router build`. */
export const CLIENT_DIR = join(appDir, 'build', 'client');

/** Artefact généré, lu par le Worker pour composer `script-src`. */
export const HASHES_FILE = join(appDir, 'workers', 'csp-script-hashes.generated.json');

/**
 * Types de `<script>` que le navigateur EXÉCUTE, et qui sont donc soumis à `script-src`.
 * Un bloc de données (`application/json`, `application/ld+json`, `speculationrules`…) n'est pas
 * exécuté et n'a pas besoin d'empreinte ; l'inscrire dans la CSP ne ferait qu'y ajouter du bruit.
 */
function isExecutableScriptType(attrs) {
  const match = /\btype\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
  if (!match) return true; // pas d'attribut type → script classique
  const value = (match[2] ?? match[3] ?? match[4] ?? '').trim().toLowerCase();
  if (value === '' || value === 'module') return true;
  return [
    'text/javascript',
    'application/javascript',
    'text/ecmascript',
    'application/ecmascript',
    'text/jscript',
    'module',
  ].includes(value);
}

/**
 * Extrait les `<script>` d'un document HTML.
 *
 * L'analyse est faite à la main plutôt qu'avec une expression régulière `<script[^>]*>` : une
 * valeur d'attribut peut légitimement contenir un `>`, et le corps d'un script peut contenir des
 * chevrons. On repère donc la fin de la balise ouvrante en respectant les guillemets, puis le
 * `</script` correspondant (React échappe les `</script>` littéraux dans les charges qu'il sérialise).
 *
 * @returns {{ attrs: string, body: string, inline: boolean, executable: boolean }[]}
 */
export function extractScripts(html) {
  const scripts = [];
  let cursor = 0;

  for (;;) {
    const open = html.indexOf('<script', cursor);
    if (open === -1) break;

    // `<scripting>` ne doit pas être confondu avec `<script>` : la balise doit s'arrêter là.
    const next = html[open + '<script'.length];
    if (next !== undefined && /[A-Za-z0-9_-]/.test(next)) {
      cursor = open + '<script'.length;
      continue;
    }

    let quote = null;
    let tagEnd = -1;
    for (let i = open + '<script'.length; i < html.length; i++) {
      const char = html[i];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '>') {
        tagEnd = i;
        break;
      }
    }
    if (tagEnd === -1) break;

    const attrs = html.slice(open + '<script'.length, tagEnd).trim();
    const close = html.indexOf('</script', tagEnd + 1);
    if (close === -1) break;

    const body = html.slice(tagEnd + 1, close);
    scripts.push({
      attrs,
      body,
      inline: !/\bsrc\s*=/i.test(attrs) && body.length > 0,
      executable: isExecutableScriptType(attrs),
    });
    cursor = close + '</script'.length;
  }

  return scripts;
}

/**
 * Empreinte CSP d'un corps de script inline. Le navigateur hache le contenu textuel EXACT du
 * `<script>`, octets bruts, sans normalisation d'espaces ni décodage d'entités.
 */
export function cspHash(body) {
  return `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
}

/** Tous les fichiers `.html` sous `dir`, chemins absolus, ordre stable. */
export function findHtmlFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.html')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/**
 * Parcourt les artefacts HTML et renvoie l'inventaire complet des scripts inline exécutables,
 * avec l'empreinte de chacun et le fichier qui le porte.
 *
 * @returns {{ hashes: string[], entries: { file: string, hash: string, bytes: number }[] }}
 */
export function collectInlineScriptHashes(clientDir = CLIENT_DIR) {
  const entries = [];
  for (const file of findHtmlFiles(clientDir)) {
    const html = readFileSync(file, 'utf8');
    for (const script of extractScripts(html)) {
      if (!script.inline || !script.executable) continue;
      entries.push({
        file: relative(clientDir, file),
        hash: cspHash(script.body),
        bytes: Buffer.byteLength(script.body, 'utf8'),
      });
    }
  }
  const hashes = [...new Set(entries.map((entry) => entry.hash))].sort();
  return { hashes, entries };
}

/** Lit la liste d'empreintes générée. Renvoie `null` si elle n'a jamais été produite. */
export function readGeneratedHashes(file = HASHES_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Génère `workers/csp-script-hashes.generated.json` à partir du build courant.
 * Échoue bruyamment plutôt que d'écrire une liste vide : une liste vide produirait un
 * `script-src 'self'` qui casse l'hydratation en silence jusqu'au premier chargement réel.
 */
export function generate({ clientDir = CLIENT_DIR, outFile = HASHES_FILE } = {}) {
  const { hashes, entries } = collectInlineScriptHashes(clientDir);

  if (entries.length === 0) {
    throw new Error(
      `[csp-hashes] aucun script inline trouvé sous ${clientDir}. Le build a-t-il tourné ? ` +
        `Écrire une liste vide produirait une CSP qui casse l'hydratation.`,
    );
  }

  const payload = {
    _comment:
      'GÉNÉRÉ par apps/mail/scripts/csp-hashes.mjs à la fin de chaque build — ne pas éditer à la main. ' +
      "Empreintes des <script> inline du shell prérendu, injectées dans script-src pour retirer 'unsafe-inline'. " +
      'Vérifié par scripts/checks/csp-inline-scripts.mjs.',
    hashes,
  };

  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { hashes, entries, outFile };
}

// --- CLI : exécuté en fin de build ---------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { hashes, entries, outFile } = generate();
  console.log(
    `[csp-hashes] ${hashes.length} empreintes (${entries.length} scripts inline) -> ${relative(process.cwd(), outFile)}`,
  );
}
