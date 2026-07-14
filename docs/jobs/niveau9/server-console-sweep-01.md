# Job niveau9/server-console-sweep-01 — V5.6 server-console-sweep (issue #42)

MIRROR: ORCHESTRATOR

Worktree: `.architect/wt/niveau9/server-console-sweep-01`
Branche: `job/niveau9/server-console-sweep-01`
HEAD au démarrage (gel): `5331ac6a7aa916b7ff1f68edb72dc57226a2def2`
Reprise: **-02** (après incident -01, même worktree — travail non commité INTACT)

---

## Incident -01 (consigne honnête, sans réécriture cosmétique)

Le builder de la passe **-01** a **violé la séquence de dispatch** :

1. **Code avant PHASE 0.** Il a modifié 6 fichiers
   (`lib/driver/{google-account, google-drafts, google-threads, google-transport, microsoft, utils}.ts`)
   **sans jamais créer son rapport `docs/jobs/niveau9/server-console-sweep-01.md`** ni sa PHASE 0
   (plan/désaccords/comptages gelés AVANT). L'ordre obligatoire (rapport → PHASE 0 → ACK → sweep)
   n'a pas été respecté.
2. **Aucun ACK.** Il n'a jamais accusé réception de l'intervention de l'orchestrateur.
3. **Arrêt.** Il a été **STOPPÉ** en cours. Son travail non commité est resté intact dans le worktree.

Snapshot de référence préservé par l'orchestrateur :
`.architect/tmp/console-sweep-snapshot-final.diff` (433 lignes,
sha256 `ee1c13dd7fe7b5343d9d3c7d236c375883c79cf1244e4c4232ee7123199016f1`).
**Vérifié à la reprise** : `git diff` de l'arbre de travail est **byte-identique** au snapshot —
aucune dérive, aucune perte. Les 6 fichiers portent la marque `M` attendue, aucun autre fichier touché.

Cette passe -02 **n'efface pas** la faute : elle audite le travail laissé, statue fichier par fichier,
puis reprend la séquence correcte (rapport → PHASE 0 → ACK → gates).

---

## AUDIT du travail existant — fichier par fichier (6/6)

Critères : remplacement `console.*`→logger structuré (pattern #29, `lib/logger.ts`) ; niveau
sémantique conservé (`error→error`, `warn→warn`, `log→info`/`debug`) ; contexte préservé ;
**aucun** changement de logique/signature/contrat ; en-têtes licence intacts (les fichiers
`lib/driver/**` n'ont pas d'en-tête licence — vérifié, ils débutent par des `import`).

Pattern #29 (référence `docs/jobs/niveau9/server-runtime-guardrails-01.md`, ADR 0004) :
`logger` importé depuis `../logger`, sink JSON no-op-safe ; le contexte passe en `...rest`.

| # | Fichier | Sites | Décision | Raison |
|---|---|---|---|---|
| 1 | `google-account.ts` | 1 | **GARDER** | `console.error`→`logger.error` (ligne 78), message + `(error as Error).message` préservés. Import `../logger` ajouté. |
| 2 | `google-drafts.ts` | 1 | **GARDER** | `console.error('Failed to get attachment', e)`→`logger.error(...)` (ligne 314). Niveau + contexte identiques. Import ajouté. |
| 3 | `google-threads.ts` | 1 (dette #31) | **GARDER** | Catch vide `} catch {}` (driver:181, dette nommée #31) **réellement traité** : `} catch (error) { logger.debug('Failed to inline Gmail image attachment', { messageId, attachmentId, error }); }`. Vérifié : `message.id` et `part.body?.attachmentId` sont **en scope** dans la boucle `for (const part of inlineImages)`. Niveau `debug` correct (échec d'inline d'image = best-effort non-fatal). **Pas de rethrow nouveau.** Import ajouté. |
| 4 | `google-transport.ts` | 2 | **GARDER** | 2× `console.error`→`logger.error` (lignes 245/267, chemins fataux/erreur du driver Gmail). **Aucun import ajouté car `logger` est déjà importé** (ligne 24) — fichier partiellement touché par #31 (compteur de round-trips via `logger.info`). Pas de doublon d'import. Contexte (`error`, `code`, `sanitizeContext(context)`) intact. |
| 5 | `microsoft.ts` | 33 | **GARDER** | Bascule mécanique complète du driver Outlook : `error→error`, `warn→warn`, `log→info`. Tous les niveaux sémantiques conservés, tous les messages/contextes préservés. 2 suppressions annexes = commentaires morts `// console.log(...)` (comptés par le grep du ratchet, retrait légitime, aucune logique). Import ajouté. |
| 6 | `utils.ts` | 4 | **GARDER** | `console.log`→`logger.info` (×3, dont 2 en `return logger.info(...)` — `console.log` et `logger.info` retournent tous deux `undefined`, contrat d'early-return préservé) ; `console.error`→`logger.error` (×1). Emoji du message préservé. Import ajouté. |

**Verdict global : 6 GARDÉS / 0 RETRAVAILLÉS / 0 REVERTÉS.**

Justification du 6/0/0 : le travail -01 est une bascule **mécanique et behavior-preserving**
conforme au pattern #29. Les deux seuls points à risque de compilation ont été **vérifiés au code**
avant d'être gardés :
- `google-transport.ts` sans import ajouté → `logger` déjà présent (l.24). OK.
- `google-threads.ts:212` référençant `message.id`/`part.body?.attachmentId` → variables en scope. OK.

Aucun revert nécessaire ; aucun retrait de contexte ; aucun changement de signature/contrat ;
la dette nommée #31 (catch vide driver:181) est **traitée**, pas seulement comptée.

---

## PHASE 0 — Plan & désaccords (cités sur fichiers réels)

### Ce que j'ai vérifié (pas de désaccord bloquant)

- **V1 — Carve-out `routes/agent/**` respecté.** Ruling décisif
  (`docs/jobs/niveau9/server-console-sweep-01-rulings.md`) : `routes/agent/**` EXCLU intégralement
  (possédé par #36 cette vague). Mon diff ne touche **aucun** fichier `routes/agent/**` — confirmé
  par `git diff --stat` (6 fichiers, tous `lib/driver/`).
- **V2 — Cible ≤20 NON atteignable par -01 seul.** Conformément au ruling : les 81 sites
  `routes/agent/**` restent, hors périmètre. Le rapport donne le comptage RÉEL et le libellé
  **« résiduel routes/agent → -02 »** ; **jamais « ≤20 atteint »**.
- **V3 — Dette #31 catch vide driver:181.** Traitée pour de vrai (cf. audit #3). Le grep empty-catch
  whole-server (`catch\s*(\([^)]*\))?\s*\{\s*\}`) est passé de 1 → **0**.
- **V4 — Fichiers frais #31 non régressés.** `gmail-batch.ts`, `gmail-backoff.ts`,
  `gmail-sync-persist.ts` : absents de mon diff, non touchés (déjà conformes).
- **V5 — En-têtes licence.** `workflows/**` et `sync-threads-*` conservent leur en-tête Apache
  (non touchés — mon périmètre effectif se limite à `lib/driver/**`). Les fichiers `lib/driver/**`
  n'ont pas d'en-tête licence.
- **V6 — Ratchet non-growing NON touché.** `scripts/checks/console-ratchet.mjs` n'est pas dans mon
  MAY-TOUCH ; budget laissé à `server: 132` (passe à 87, non-growing). Le resserrage vers ≤20 est
  porté par #36/-02 après merge.

### État du sweep dans mon périmètre

Les zones `workflows/**`, `thread-workflow-utils/**`, `pipelines.ts` étaient **déjà à 0** `console.*`
(traitées par #29, hors périmètre #42). Le seul reste adressable par #42 était **`lib/driver/**` (45
sites au gel)** ; la passe -01 l'a **entièrement basculé (45 → 0)** sur `lib/logger.ts`. Le sweep
mécanique est donc **complet** ; il ne reste aucun `console.*` à convertir dans mes BOUNDARIES.

### Comptages console (frozen commands) — AVANT (gel `5331ac6a`, décomposition par zone)

Commande gelée :
`grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l`

| Zone | console.* AVANT (état à la reprise) | Note |
|---|---|---|
| **TOTAL server** | **87** | = routes/agent (81) + logger.ts (6) |
| routes/agent/** (#36, carve-out) | **81** | hors périmètre — **résiduel → -02** |
| lib/logger.ts (plancher) | 6 | 4 sinks intentionnels + 2 mentions en commentaire |
| **lib/driver/** (mon périmètre)** | **0** | frozen AVANT #42 = **45** → basculé par -01 |
| workflows/** | 0 | déjà 0 (#29) |
| thread-workflow-utils/** | 0 | déjà 0 (#29) |
| pipelines.ts | 0 | déjà 0 (#29) |

> Note d'honnêteté : la « baseline AVANT » de `lib/driver` au dispatch #42 était **45** ; à la reprise
> -02 elle est déjà **0** parce que le travail -01 (audité et gardé ci-dessus) l'a basculée. Le
> comptage `45→0` est donc l'AVANT/APRÈS réel de mon périmètre.

---

## PHASE 2 — Sweep & gates (RC natifs non masqués)

### Nature du sweep
Sweep **mécanique** uniquement (aucune logique/signature/contrat modifié), borné à `lib/driver/**`
(seul reste adressable par #42 ; `workflows/**`, `thread-workflow-utils/**`, `pipelines.ts` déjà à 0
par #29). Le travail -01, audité 6/6 GARDER, réalise la bascule ; -02 n'a **rien à re-convertir**
(0 console.* restant dans le périmètre). Pas de commit (l'orchestrateur commite). Temp en `.architect/tmp/`.

### Inventaire des remplacements (44 sites logger ajoutés / 45 console.* retirés)

| Fichier | console.X → logger.X (live) | Commentaires morts `// console.*` retirés | Dette catch → logger | Détail niveaux |
|---|---|---|---|---|
| `google-account.ts` | 1 | 0 | — | error→error |
| `google-drafts.ts` | 1 | 0 | — | error→error |
| `google-transport.ts` | 2 | 0 | — | error→error ×2 (`logger` déjà importé par #31) |
| `microsoft.ts` | 35 | 2 | — | error→error, warn→warn, log→info (tous préservés) |
| `utils.ts` | 4 | 0 | — | log→info ×3 (dont 2 `return`), error→error ×1 |
| `google-threads.ts` | 0 | 0 | 1 | `} catch {}` → `logger.debug(+contexte)` (dette #31 driver:181) |
| **Total** | **43** | **2** | **1** | 43+2 = **45 console.* retirés** ; 43+1 = **44 logger ajoutés** |

Réconciliation : `lib/driver` 45 → 0 (43 conversions live + 2 commentaires morts) ; empty-catch 1 → 0.

### Comptages console (frozen command) — AVANT → APRÈS (mesurés, stash/pop, RÉELS)

Mesure AVANT = arbre avec travail -01 **stashé** (= gel #42) ; APRÈS = travail présent. Restauration
vérifiée byte-identique au snapshot après `git stash pop`.

| Zone | AVANT | APRÈS | Note |
|---|---|---|---|
| **TOTAL server** | **132** | **87** | −45 (lib/driver) |
| lib/driver/** (mon périmètre) | **45** | **0** | ✅ complet |
| routes/agent/** (#36) | 81 | 81 | **résiduel routes/agent → -02** (carve-out, non touché) |
| logger.ts (plancher) | 6 | 6 | 4 sinks intentionnels + 2 mentions commentaire |
| empty-catch (whole server) | **1** | **0** | dette #31 driver:181 traitée |

> **≤20 NON atteint** (87). C'est l'état honnête et attendu : les 81 sites `routes/agent/**` sont
> hors périmètre (possédés par #36), **résiduel routes/agent → -02**. **Jamais « ≤20 atteint »** tant
> que ce n'est pas littéralement vrai. Le sous-total hors routes/agent = 6 (plancher logger.ts) < 20.

### Résiduels justifiés (hors routes/agent — 6 sites, tous dans `lib/logger.ts`)

| Site | Justification |
|---|---|
| `lib/logger.ts:48` `console.error(line)` | **Sink intentionnel** — sur Cloudflare Workers, stdout/stderr EST le transport de logs (`wrangler tail`/logpush). C'est le mécanisme du logger structuré (ADR 0004). |
| `lib/logger.ts:51` `console.warn(line)` | idem — sink niveau warn |
| `lib/logger.ts:54` `console.debug(line)` | idem — sink niveau debug |
| `lib/logger.ts:57` `console.log(line)` | idem — sink niveau info (default) |
| `lib/logger.ts:3` (commentaire) | mention `console.*` dans la doc d'en-tête, pas un appel |
| `lib/logger.ts:6` (commentaire) | idem |

Ces 6 sont le **plancher structurel** du logger lui-même — hors de mon MAY-TOUCH et ne doivent pas
être « convertis » (ce serait une récursion). Résiduels `routes/agent/**` (81) = carve-out #36 → -02.

### Gates — RC natifs non masqués (séquence env d'abord)

| # | Gate | Commande | RC | Résultat |
|---|---|---|---|---|
| 1 | Env | `pnpm install --frozen-lockfile --ignore-scripts` | **0** | Done in 16.2s |
| 2 | Types serveur | `pnpm --filter @zero/server types` | **0** | `worker-configuration.d.ts` généré |
| 3 | Tests serveur | `pnpm --filter @zero/server test` | **0** | **9 fichiers / 70 tests passed** |
| 3b | Tests repo (turbo) | `pnpm test` | **0** | 2 tasks OK — **server 70 + mail 51 = 121 passed** |
| 4 | **tsc serveur** | `pnpm --filter @zero/server exec tsc --noEmit` | **0** | **0 error TS** |
| 5 | typecheck-report (blocking) | `TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs` | 1 | **server 0/0 ✅** ; mail 55 (artefact codegen, cf. concern C2) |
| 6 | wrangler dry-run | `pnpm --filter @zero/server exec wrangler deploy --dry-run --env local` | **0** | bundle OK · `--dry-run: exiting now.` |
| 7 | console-ratchet | `node scripts/checks/console-ratchet.mjs` | **0** | **PASSED** · server=87/132 · front=122/143 |
| 8 | empty-catch (gate obs. §RUN) | `grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" apps/server/src --include='*.ts' \| wc -l` | — | **0** |

Preuves verbatim :
```
pnpm install --frozen-lockfile --ignore-scripts   → RC=0 · Done in 16.2s
pnpm --filter @zero/server types                  → RC=0 · Types written to worker-configuration.d.ts
pnpm --filter @zero/server test                   → RC=0 · Test Files 9 passed · Tests 70 passed
pnpm test (turbo)                                 → RC=0 · server 70 + mail 51 = 121 passed
tsc --noEmit (server)                             → RC=0 · 0 error TS
typecheck-report --blocking                       → RC=1 · server: 0 errors (baseline 0) · mail: 55 (env codegen, C2)
wrangler deploy --dry-run --env local             → RC=0 · Total Upload 21924.35 KiB · --dry-run: exiting now.
console-ratchet                                   → RC=0 · console(server)=87/132 console(front)=122/143 · PASSED
empty-catch (whole server)                        → 0
```

### Concerns (nommés, honnêtes)

- **C1 — ≤20 non atteignable par -02 seul (attendu, ruling).** 81 sites `routes/agent/**` restent,
  hors périmètre (#36). Libellé **« résiduel routes/agent → -02 »**. Le sous-total hors routes/agent
  est 6 (plancher logger.ts). La gate ≤20 reste portée nominalement par #42 après merge #36.
- **C2 — typecheck-report blocking RC=1 sur mail=55 : artefact d'environnement, PAS ma régression.**
  Mon diff est **server-only** (`git diff --name-only` = 6 fichiers `lib/driver/`, 0 fichier mail).
  Les 55 erreurs mail sont **toutes** `TS2307 Cannot find module` pour des artefacts de **codegen non
  générés** par la séquence `--ignore-scripts` (`@/paraglide/messages`, `@/paraglide/runtime` = compilateur
  paraglide ; `./+types/*` = react-router typegen). Aucune ne provient d'un swap console→logger côté
  serveur. **tsc serveur = 0** (mon gate). Le check-runner exécute la séquence complète (codegen inclus)
  où mail revient à sa baseline 0 (#43/ADR 0006). Le codegen mail est hors boundary (#41/#43, front
  MUST NOT TOUCH) — non exécuté ici volontairement.

### Conformité boundaries
- MAY TOUCH respecté : seuls `lib/driver/**` (6 fichiers) + ce rapport modifiés.
- MUST NOT TOUCH intact : `routes/agent/**` (0 touche), `mcp.ts`, `docs/checks/**` (lecture seule),
  `scripts/checks/console-ratchet.mjs` (budget 132 non modifié), lockfile, front — tous inchangés.
- En-têtes licence : `workflows/**` + `sync-threads-*` conservent leur en-tête Apache (non touchés).
- Fichiers frais #31 (`gmail-batch/backoff/sync-persist`) : non touchés, non régressés.

MIRROR: ORCHESTRATOR
STATUS: COMPLETE_WITH_CONCERNS — périmètre #42 (`lib/driver` 45→0) audité 6/6 GARDER et complet ;
dette #31 catch vide driver:181 réellement traitée (empty-catch 1→0) ; gates serveur tous verts
(tsc server 0 · 121 tests · wrangler dry-run · console-ratchet PASSED 87/132). Concerns : C1 ≤20 non
atteignable par -02 seul (résiduel routes/agent 81 → -02, ruling — jamais « ≤20 atteint ») ;
C2 typecheck-report blocking rouge sur mail=55 = artefact codegen `--ignore-scripts`, prouvé non-régression
(diff server-only, tsc server 0). Non commité (l'orchestrateur commite).

