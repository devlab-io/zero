# Job — server-console-sweep-02 (issue devlab-io/zero#42, passe -02)

Worktree : `.architect/wt/niveau9/server-console-sweep-02`
Branche : `job/niveau9/server-console-sweep-02`
HEAD (gel) : `66c0c50058aaf16fc0540610d3591411a1bf289a`
Ancrages vérifiés présents : `docs/checks/niveau9/observability.md`, `docs/jobs/niveau9/server-console-sweep-01-rulings.md`.

## PHASE 0 — plan, désaccords, comptage gelé AVANT (aucune modification de code à ce stade)

### Objectif
Basculer les `console.*` de `apps/server/src/routes/agent/**` vers le logger structuré
(`lib/logger`, pattern #29), niveau sémantique conservé. Cible A5 :
comptage gelé total server ≤20.

Métrique gate (verbatim) :
`grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l`

### Comptage gelé AVANT (par zone, verbatim au HEAD de gel)

| Zone | Sites `console.` |
|---|---|
| **TOTAL server (métrique A5)** | **86** |
| routes/agent/** (MA zone) | 80 |
| lib/logger.ts (hors zone, résiduel attendu) | 6 |

Détail routes/agent/** (par fichier) :

| Fichier | Sites | dont sites d'appel vivants | dont non-sites |
|---|---|---|---|
| routes/agent/topics.ts | 26 | 26 | 0 |
| routes/agent/sync.ts | 22 | 20 | 2 (commentés morts : L270, L272) |
| routes/agent/projection.ts | 11 | 11 | 0 |
| routes/agent/chat-agent.ts | 6 | 6 | 0 |
| routes/agent/tools.ts | 5 | 5 | 0 |
| routes/agent/recipients.ts | 4 | 4 | 0 |
| routes/agent/labels.ts | 4 | 4 | 0 |
| routes/agent/zero-driver.ts | 1 | 1 | 0 |
| routes/agent/orchestrator.ts | 1 | 1 | 0 |
| **routes/agent total** | **80** | **78** | **2** |

Vérifications complémentaires au gel :
- `mcp.ts` / `mcp-tools.ts` (recomposés #36) : **0 `console.*`** (déjà loggés, rien à régresser).
  `mcp.ts` importe déjà `logger` depuis `../../lib/logger`.
- Aucun `console.` détecté à l'intérieur d'un littéral de chaîne/prompt dans routes/agent
  (tous les 80 sont soit des appels réels, soit — pour 2 d'entre eux — du code commenté mort).

### Plan (mécanique uniquement — pattern #29)
1. Ajouter `import { logger } from '../../lib/logger';` dans les 8 fichiers à convertir
   (mcp.ts l'a déjà). Import inséré après l'en-tête de licence quand il existe, sinon
   dans le groupe d'imports en tête.
2. Convertir les **78 sites d'appel vivants** :
   - `console.error(...)` → `logger.error(...)`
   - `console.warn(...)`  → `logger.warn(...)`
   - `console.log(...)`   → `logger.info(...)` (défaut, aligné précédent -01)
     - Exception faithful : 2 lignes explicitement préfixées `[DEBUG]` dans tools.ts
       (L330 `[DEBUG] buildGmailSearchQuery`, L353 `[DEBUG] getCurrentDate`) → `logger.debug(...)`.
   - Message + arguments/contexte **strictement préservés** (aucun ajout/retrait de données).
3. Aucun changement de logique/signature/contrat/flux. Aucun rethrow nouveau.
   En-têtes de licence préservés.

### Désaccords / nuances explicites (fichiers cités)
- **`routes/agent/sync.ts:270` et `:272`** — `//     console.log(...)` / `//     console.error(...)`
  sont dans un bloc `catch` **entièrement commenté** (fallback workflow désactivé, L265-273).
  Ce ne sont PAS des sites d'appel. Par analogie stricte avec la règle « un littéral dans une
  string n'est pas un site d'appel — liste-le, ne le réécris pas », je les traite en **résiduels
  justifiés** : les réécrire (ou supprimer le bloc mort) serait un changement de code hors du
  périmètre mécanique console→logger. → restent 2 matches `console.` dans routes/agent après passage.
- **Niveau `console.log` → `logger.info`** : choix par défaut aligné sur -01 (jugé ACCEPT), qui
  a mappé la majorité des `console.log` en `logger.info` et réservé `logger.debug` aux chemins
  verbeux (cf. `lib/driver/google-threads.ts:216`). Les 2 lignes `[DEBUG]` de tools.ts sont
  mappées en `logger.debug` pour fidélité sémantique (elles s'auto-décrivent comme debug).

### Comptage attendu APRÈS
- routes/agent : 78 sites vivants → 0 `console.*` d'appel ; **résiduel = 2** (sync.ts L270/L272 commentés).
- lib/logger.ts : **6** (sinks intentionnels + commentaires, hors zone, MUST NOT TOUCH).
- **TOTAL server attendu = 8 ≤ 20** → gate A5 PASS (libellé honnête : atteint si et seulement si
  le grep final vaut ≤20).

---

## PHASE 1 — RÉSULTATS

### Comptage APRÈS (par zone, verbatim)

Métrique gate A5 :
`grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l`
→ **8** (86 → 8).

| Zone | AVANT | APRÈS |
|---|---|---|
| **TOTAL server (métrique A5)** | 86 | **8 ≤ 20 ✅** |
| routes/agent/** | 80 | 2 (commentés morts, non-sites) |
| lib/logger.ts (hors zone) | 6 | 6 (inchangé) |

### Inventaire des remplacements (78 sites d'appel convertis, mécanique #29)

| Fichier | error→error | warn→warn | log→info | log→debug | import ajouté | total |
|---|---|---|---|---|---|---|
| routes/agent/topics.ts | 6 | 4 | 16 | 0 | 1 | 26 |
| routes/agent/sync.ts | 4 | 2 | 14 | 0 | 1 | 20 |
| routes/agent/projection.ts | 3 | 1 | 7 | 0 | 1 | 11 |
| routes/agent/chat-agent.ts | 4 | 2 | 0 | 0 | 1 | 6 |
| routes/agent/tools.ts | 2 | 0 | 1 | 2 | 1 | 5 |
| routes/agent/recipients.ts | 2 | 2 | 0 | 0 | 1 | 4 |
| routes/agent/labels.ts | 2 | 2 | 0 | 0 | 1 | 4 |
| routes/agent/orchestrator.ts | 1 | 0 | 0 | 0 | 1 | 1 |
| routes/agent/zero-driver.ts | 1 | 0 | 0 | 0 | 1 | 1 |
| **TOTAL** | **25** | **13** | **38** | **2** | **9** | **78** |

- `import { logger } from '../../lib/logger';` inséré dans les 8 fichiers qui ne l'avaient pas
  (mcp.ts l'avait déjà, non retouché). Placé après l'en-tête de licence quand présent, sinon en
  tête du groupe d'imports. En-têtes de licence **préservés** (ligne 1 = `/*` sur les 7 fichiers licenciés).
- `log→debug` (2) : `tools.ts` L331 `[DEBUG] buildGmailSearchQuery`, L354 `[DEBUG] getCurrentDate`
  — fidélité au préfixe `[DEBUG]` d'origine.
- Aucun changement de logique/signature/contrat/flux. Aucun rethrow nouveau. Message + contexte
  strictement préservés. Diff net = +87 / −78 (les +9 supplémentaires = les 9 lignes d'import).

### Résiduels justifiés site par site

| Site | Nature | Justification |
|---|---|---|
| routes/agent/sync.ts:271 | `//     console.log(...)` | Ligne **commentée** dans un bloc `catch` fallback entièrement désactivé (L266-274). Pas un site d'appel. Hors périmètre mécanique console→logger ; réécrire/supprimer serait un changement de code. |
| routes/agent/sync.ts:273 | `//     console.error(...)` | Idem — même bloc commenté mort. |
| lib/logger.ts (×6) | sinks intentionnels + commentaires | **Hors zone** (MUST NOT TOUCH). Le logger EST le mécanisme structuré : `console.error/warn/debug/log` y sont les sinks par niveau (résiduel attendu et documenté §RUN). |

Aucun littéral `console.` dans une chaîne/prompt détecté dans routes/agent (les 80 matches gelés
étaient 78 appels réels + 2 commentés). Rien à réécrire côté prompts.

### GATES — RC natifs non masqués (séquentiels, logs dans .architect/tmp/)

| # | Gate | RC | Résultat |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile --ignore-scripts` | 0 | Done in 15.8s |
| 2 | `pnpm --filter @zero/server types` | 0 | wrangler types OK |
| 3 | `pnpm --filter @zero/server exec tsc --noEmit` | 0 | 0 erreur type |
| 4 | `pnpm --filter @zero/server exec vitest run` | 0 | **90 passed** (10 files) |
| 5 | `node scripts/checks/console-ratchet.mjs` | 0 | `console(server)=8/87` — BAISSÉ, PASSED (no regression) |
| 6 | `node scripts/security/check-agent-surface.mjs` | 0 | least scopes, bounded cache, draft-only MCP |
| 7 | `wrangler deploy --dry-run --env local --outdir .architect/tmp/dryrun` | 0 | `--dry-run: exiting now.` |

Note honnêteté (ruling -01) : la cible A5 « serveur ≤20 » est désormais **littéralement atteinte
(8)** ; -01 avait laissé le résiduel routes/agent → -02, ce que cette passe résorbe.

MIRROR: ORCHESTRATOR

STATUS: COMPLETE
