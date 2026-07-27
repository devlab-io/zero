#!/usr/bin/env node
// csp-inline-scripts.mjs — la CSP servie doit couvrir TOUS les scripts inline du build.
//
// `script-src` ne porte plus `'unsafe-inline'` : les scripts inline du shell prérendu sont
// autorisés nommément par leur empreinte sha256, générée en fin de build dans
// apps/mail/workers/csp-script-hashes.generated.json. Deux de ces scripts changent à chaque
// build (le bootstrap d'hydratation cite les noms de chunks, donc l'environnement de build ;
// react-wrap-balancer cite un `useId` React). Sans ce contrôle, la moindre désynchronisation
// passerait inaperçue jusqu'au premier chargement réel — et casserait l'hydratation en production.
//
// Ce que le contrôle prouve, sur les artefacts fraîchement construits :
//   1. `script-src` ne contient pas `'unsafe-inline'` (ni `'unsafe-eval'`, ni `'unsafe-hashes'`) ;
//   2. chaque script inline exécutable présent dans build/client/**.html a son empreinte dans la
//      liste générée — donc dans l'en-tête que le Worker émet ;
//   3. la liste ne contient pas d'empreinte orpheline (signe d'un artefact périmé).
//
// À lancer APRÈS un build : `node scripts/checks/csp-inline-scripts.mjs`.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLIENT_DIR,
  HASHES_FILE,
  collectInlineScriptHashes,
  readGeneratedHashes,
} from '../../apps/mail/scripts/csp-hashes.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workerSource = resolve(repoRoot, 'apps/mail/workers/spa-fallback.ts');
const failures = [];

// --- 1. La directive script-src elle-même --------------------------------------------------
//
// La lecture est ANCRÉE sur le littéral `const CONTENT_SECURITY_POLICY = [ … ]` et les
// commentaires y sont retirés avant analyse : chercher « script-src » à l'aveugle dans le fichier
// tomberait sur les commentaires qui documentent la directive — un contrôle qui lit sa propre
// documentation est un contrôle muet.
const worker = readFileSync(workerSource, 'utf8');
const policyBlock = /const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join\(/.exec(worker);

if (!policyBlock) {
  failures.push(
    `apps/mail/workers/spa-fallback.ts : impossible de localiser le littéral ` +
      `CONTENT_SECURITY_POLICY. S'il a été renommé ou déplacé, ce contrôle doit être mis à jour — ` +
      `il ne doit pas devenir muet.`,
  );
}

const policyEntries = (policyBlock?.[1] ?? '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, '').trim())
  .join(' ');
// Le délimiteur est capturé puis exigé à la fermeture : la directive contient elle-même des
// apostrophes (`'self'`, les empreintes), qu'une classe de caractères naïve couperait au premier
// guillemet — le contrôle lirait alors une directive vide et se croirait satisfait.
const scriptSrc = /(["'`])script-src ((?:(?!\1)[\s\S])*)\1/.exec(policyEntries);

if (policyBlock && !scriptSrc) {
  failures.push(
    `apps/mail/workers/spa-fallback.ts : CONTENT_SECURITY_POLICY ne déclare plus de directive ` +
      `script-src. Sans elle, default-src 'self' s'applique et l'hydratation casse.`,
  );
} else if (scriptSrc) {
  const directive = scriptSrc[2];
  for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'"]) {
    if (directive.includes(forbidden)) {
      failures.push(
        `script-src porte ${forbidden} — la CSP redevient un décor. Les scripts inline du shell ` +
          `sont couverts par leurs empreintes (${HASHES_FILE}).`,
      );
    }
  }
  if (!directive.includes("'self'")) {
    failures.push("script-src ne porte plus 'self' : les chunks hachés ne se chargeraient plus.");
  }
}

// --- 2 & 3. Couverture des artefacts -------------------------------------------------------
if (!existsSync(CLIENT_DIR)) {
  console.error(
    `[csp-inline-scripts] ÉCHEC : ${CLIENT_DIR} est absent. Ce contrôle se lance APRÈS un build ` +
      `(pnpm build, ou pnpm --filter @zero/mail build:staging).`,
  );
  process.exit(1);
}

const generated = readGeneratedHashes();
if (!generated || !Array.isArray(generated.hashes)) {
  failures.push(
    `${HASHES_FILE} est absent ou illisible : le build n'a pas exécuté ` +
      `apps/mail/scripts/csp-hashes.mjs. Le Worker servirait des empreintes périmées.`,
  );
}

const declared = new Set(generated?.hashes ?? []);
const { entries } = collectInlineScriptHashes();
const present = new Set(entries.map((entry) => entry.hash));

for (const entry of entries) {
  if (!declared.has(entry.hash)) {
    failures.push(
      `script inline NON COUVERT par la CSP : ${entry.file} (${entry.bytes} o, ${entry.hash}). ` +
        `Relancer le build pour régénérer les empreintes.`,
    );
  }
}

for (const hash of declared) {
  if (!present.has(hash)) {
    failures.push(
      `empreinte orpheline dans la liste générée : ${hash} — elle ne correspond à aucun script ` +
        `du build courant. La liste est périmée.`,
    );
  }
}

// --- Verdict -------------------------------------------------------------------------------
if (failures.length > 0) {
  console.error('[csp-inline-scripts] ÉCHEC');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[csp-inline-scripts] OK — ${entries.length} scripts inline / ${declared.size} empreintes ` +
    `couvrent build/client, script-src sans 'unsafe-inline'.`,
);
