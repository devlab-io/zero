# Job — niveau9/migrations-repair-01 (issue devlab-io/zero#19, V1.4 migrations-repair)

Worktree : `.architect/wt/niveau9/migrations-repair-01` — branche `job/niveau9/migrations-repair-01`
HEAD gelé : `a8ef30bc9c0c1efdfedd5e775abd4892f7517252` (vérifié = attendu).
Check gelé : `docs/checks/niveau9/data-config.md` (points 1–4 + 6 ; point 5 = issue #29).

---

## PHASE 0 — Plan & désaccords (avant tout code)

### État mesuré au gel (baseline, avant modification)

- **42** `.sql` sur disque ; **39** tags journalisés distincts (**40** entrées de journal — une doublée) ; **3** orphelins ; **4** groupes de préfixes dupliqués (`0025/0029/0032/0035`) ; **1** trou de préfixe (`0037`).
- Orphelins : `0025_far_echo`, `0029_thin_triathlon`, `0032_smiling_raider` — chacun **une** instruction `ALTER TABLE "mail0_user_settings" ALTER COLUMN "settings" SET DEFAULT …::jsonb`.
- Journal : idx 32 **et** idx 33 → même tag `0032_add_image_compression_setting` (`when` identique `1750648088006`), puis un 2ᵉ idx 33 → `0033_first_bastion`. idx 37 → tag `0035_uneven_shiva` ⇒ trou de préfixe `0037`.
- 2ᵉ config drizzle (`routes/agent/db`) : dialecte **SQLite / driver `durable-sqlite`** (Durable Objects), journal propre (1 entrée). Isolation volontaire, **pas** un drift.
- Baseline `migrations-consistency.mjs` : **exit 0** (allowlist pré-remplie #17). `drizzle-kit generate` : « No schema changes », `git status` vide ⇒ **drift = 0**.

### Origine git (prouvée : `git log --follow --diff-filter=A`)

- `0025_far_echo` **et** `0029_thin_triathlon` créés le **même** commit `4377e042` (2025-04-09, branche longue « golden ticket ») ; jumeaux journalisés créés **plus tard** sur main (`0025_nervous_paper_doll` 2025-04-30 `e1deecc9` ; `0029_common_network` 2025-06-18 `b048c742`).
- `0032_smiling_raider` = PR auto-read #1473 (2025-06-24 `8d2a00d9`) collisionnée avec `0032` déjà pris par #1397 (2025-06-19 `7db4b08c`).
- Pattern textbook : drizzle-kit incrémente le préfixe sans conscience des branches ; le merge ne renumérote pas ⇒ préfixes dupliqués + orphelins + trou.

### Plan

1. `docs/solutions/migrations-drift.md` : table `.sql→statut` (42), diff de contenu par orphelin vs jumeau + verdict + preuve git, §trou 0037/dups + règle de prévention, §doublon journal 0032.
2. `docs/adr/0001-…` : 2ᵉ config drizzle **isolée volontairement** (SQLite/durable-sqlite DO vs Postgres — dialectes incompatibles), lien au SQLite des Durable Objects.
3. `meta/_journal.json` : retirer **l'unique** entrée `0032` dupliquée (correction, **pas** renumérotation). Vérifié drift-neutre par `generate` avant/après.
4. `migrations-consistency.mjs` + allowlist : chaque exception porte un **doc-ref** ; le script **exige** que la ref résolve (fichier + ancre). Réduction aux exceptions durables. Back-compat forme tableau.
5. Re-run consistency (exit 0) + generate (drift 0). **`git diff` sur `.sql` = vide** (prouvé).

### Désaccords (nommés, avec raisons et fichiers réels)

- **D1 (majeur).** L'objectif et le commentaire d'en-tête du script (`migrations-consistency.mjs` L10-13 d'origine) affirment que #19 « vide l'allowlist » en « supprimant les orphelins et dé-dupliquant les préfixes ». C'est **frontalement interdit** par la règle absolue de ce job et le check `data-config.md` L9-11 (jamais supprimer/renuméroter un `.sql` appliqué). Les 3 orphelins ne peuvent être ni supprimés ni journalisés (les journaliser mentirait — ce ne sont pas des maillons appliqués de la lignée), et `0025/0029/0032/0035` ne peuvent être renumérotés. **L'allowlist NE PEUT donc PAS être VIDÉE.** Seule issue licite = **réduite aux 7 exceptions durables** (3 orphelins + 4 préfixes), chacune liée+vérifiée à sa section du drift-doc. L'acceptation offre explicitement « VIDÉE **ou réduite aux seules entrées durablement documentées** » : je livre la seconde option, pleinement.
- **D2 (mineur).** Le commentaire d'en-tête d'origine du script décrivait l'approche interdite → devenu trompeur. Corrigé (commentaire seulement, dans les boundaries).
- **D3 (jugement, pas désaccord).** Toucher `meta/_journal.json` pour le doublon `0032` : jugé in-scope (« correction d'entrées pointant des fichiers existants », jamais renumérotation) et bénéfique (39 tags ↔ 39 entrées). **Innocuité prouvée** par `generate` avant/après (sortie identique, `git status` `.sql` vide).

PHASE 0 transmise au team-lead avant tout code (MIRROR: ORCHESTRATOR, pas d'attente d'approbation).

---

## Résultats bruts

### 1. Table de réconciliation `.sql` → statut

**42 = 39 journalisés + 3 orphelins statués. 0 fichier `.sql` non couvert.** (Table complète : `docs/solutions/migrations-drift.md` §2.) Extrait des lignes non triviales :

| fichier .sql | préfixe | statut | idx journal |
|---|---|---|---|
| `0025_far_echo.sql` | 0025 | **orphelin → statué** (§4.1) | — |
| `0025_nervous_paper_doll.sql` | 0025 | journalisé | 25 |
| `0029_common_network.sql` | 0029 | journalisé | 29 |
| `0029_thin_triathlon.sql` | 0029 | **orphelin → statué** (§4.2) | — |
| `0032_add_image_compression_setting.sql` | 0032 | journalisé | 32 (~~33 doublon retiré~~) |
| `0032_smiling_raider.sql` | 0032 | **orphelin → statué** (§4.3) | — |
| `0033_first_bastion.sql` | 0033 | journalisé | 33 |
| `0035_giant_hydra.sql` | 0035 | journalisé | 35 |
| `0035_uneven_shiva.sql` | 0035 | journalisé | 37 |
| `0038_famous_malcolm_colcord.sql` | 0038 | journalisé | 38 |

### 2. Diffs de contenu des 3 orphelins (résumé + verdict)

- **`0025_far_echo` vs `0025_nervous_paper_doll` → doublon de contenu subsumé (mort).** L'orphelin = 1 instruction ; le jumeau = 4 (DROP FK → `SET DEFAULT` → ADD FK). L'unique instruction de l'orphelin est **byte-identique** à l'une du jumeau (`grep -Fq` → trouvée). Effet strictement inclus dans le jumeau journalisé.
- **`0029_thin_triathlon` vs `0029_common_network` → superseded (mort).** Divergent : orphelin ajoute `"autoRead":true` ; jumeau ajoute `"categories":[…6…]`. Deux lignes parallèles ; le `SET DEFAULT` de l'orphelin est recouvert par les `SET DEFAULT` journalisés ultérieurs.
- **`0032_smiling_raider` vs `0032_add_image_compression_setting` → superseded (mort).** Divergent : orphelin porte `"autoRead":true` (sans `imageCompression`) ; jumeau porte `"imageCompression":"medium"` (sans `autoRead`). Préfixe `0032` déjà pris 5 j avant par #1397.

Argument de sécurité commun : chaque orphelin est **un seul** `ALTER COLUMN … SET DEFAULT` — idempotent, last-writer-wins, recouvert par la lignée journalisée. Qu'il ait été appliqué ou non sur tel environnement est **sans effet** sur le schéma courant (drift = 0, `generate` propre). Détails + diffs verbatim : `docs/solutions/migrations-drift.md` §3–4.

### 3. `migrations-consistency.mjs` — AVANT / APRÈS

**AVANT (allowlist #17 pré-remplie) :**
```
migrations-consistency [apps/server/src/db/migrations]: 42 sql, 39 journalled, 3 orphan(s), 0 missing, 4 duplicate-prefix group(s)
migrations-consistency [apps/server/src/routes/agent/db/drizzle]: 1 sql, 1 journalled, 0 orphan(s), 0 missing, 0 duplicate-prefix group(s)
migrations-consistency PASSED (drift within documented allowlist).
EXIT: 0
```

**APRÈS (allowlist réduite + référencée, script étendu) :**
```
migrations-consistency [apps/server/src/db/migrations]: 42 sql, 39 journalled, 3 orphan(s), 0 missing, 4 duplicate-prefix group(s)
migrations-consistency [apps/server/src/routes/agent/db/drizzle]: 1 sql, 1 journalled, 0 orphan(s), 0 missing, 0 duplicate-prefix group(s)
migrations-consistency PASSED (drift within documented allowlist).
EXIT: 0
```

**Tests négatifs (le garde-fou mord) — allowlist restaurée byte-identique après chaque test :**
```
NEG A (ancre inexistante):  FAILED — orphan allowlist entry '0025_far_echo' — anchor '#does-not-exist' not found in docs/solutions/migrations-drift.md   → EXIT 1
NEG B (exception retirée):  FAILED — orphan SQL not journalled: 0029_thin_triathlon.sql                                                              → EXIT 1
NEG C (fichier réf absent): FAILED — duplicate-prefix allowlist entry '0035' — referenced file not found: docs/solutions/does-not-exist.md          → EXIT 1
RESTORE:                    PASSED → EXIT 0 ; diff -q allowlist == good → IDENTICAL
```

### 4. `drizzle-kit generate` — sortie verbatim (config principale Postgres)

Avant **et** après la réparation du journal, sortie identique :
```
Reading config file '…/apps/server/drizzle.config.ts'
17 tables
mail0_account 13 columns 3 indexes 1 fks
… (17 tables mail0_*) …
mail0_writing_style_matrix 4 columns 1 indexes 1 fks

No schema changes, nothing to migrate 😴
```
`git status --porcelain` après `generate` : **aucun** `.sql`/snapshot généré. **Drift schéma/migrations = 0.**

### 5. Réparation du journal (`meta/_journal.json`)

Retrait de l'unique entrée dupliquée `0032_add_image_compression_setting` (idx 33, `when 1750648088006`). Après :
```
entries: 39 | distinct tags: 39 | distinct idx: 39
duplicate tags: NONE | duplicate idx: NONE
idx sequence: 0,1,…,38 (contigu)
```
`0033_first_bastion` conserve idx 33 ; suite inchangée. **Pas de renumérotation.**

### 6. Périmètre & sécurité (audit)

```
ls apps/server/src/db/migrations/*.sql | wc -l  → 42
git diff -- '*.sql'                              → 0 ligne (diff .sql VIDE)
Fichiers modifiés : meta/_journal.json, scripts/checks/migrations-allowlist.json, scripts/checks/migrations-consistency.mjs
Fichiers neufs    : docs/adr/, docs/solutions/
UNCHANGED (forbidden) : schema.ts, pnpm-lock.yaml, package.json, pnpm-workspace.yaml, apps/server/drizzle.config.ts, docs/checks/, .github/
```

### 7. Correspondance aux critères d'acceptation

- **Point 1 (réconciliation)** — ✅ 42 fichiers couverts : 39 journalisés + 3 orphelins statués (diff+décision+preuve) dans `migrations-drift.md`.
- **Point 2 (script CI)** — ✅ `migrations-consistency.mjs` échoue sur orphelin/entrée-sans-fichier/préfixe-dupliqué non documenté (tests négatifs A/B/C) + exige la résolution des doc-refs. Branchement `ci.yml` = **handoff orchestrateur** (boundary `.github/**` interdite).
- **Point 3 (trou 0037 + dups)** — ✅ expliqués (origine merge/rebase, preuve git) + règle de prévention (`migrations-drift.md` §5).
- **Point 4 (2ᵉ config)** — ✅ ADR `docs/adr/0001-second-drizzle-config-durable-objects-sqlite.md` : isolée volontairement, lien SQLite des DO.
- **Point 6 (vert de bout en bout)** — ✅ `drizzle-kit generate` sur le schéma principal : aucune migration inattendue, drift 0.
- **Point 5 (garde `db:push`)** — hors scope (issue #29).

---

## MIRROR: ORCHESTRATOR

- **Contrat rempli** : journal ↔ disque réconcilié ; 3 orphelins statués (diff/décision/preuve git) ; doublon journal 0032 retiré (sans renumérotation) ; trou 0037 + dups expliqués + règle de prévention ; ADR 2ᵉ config ; `migrations-consistency` exit 0 avec allowlist **réduite + référencée + auto-vérifiée** ; `drizzle-kit generate` drift 0 ; **diff `.sql` vide**.
- **Décision majeure à valider (D1)** : allowlist **réduite, non vidée** — imposé par la règle absolue (impossible de supprimer les orphelins / renuméroter les préfixes). C'est la seconde branche explicite de l'acceptation (« VIDÉE **ou réduite**… »). Si un juge exige une allowlist vide, cela **exigerait de violer la règle absolue** — à trancher, mais je le déconseille.
- **Handoffs** : (a) brancher `scripts/checks/migrations-consistency.mjs` dans `.github/ci.yml` (orchestrateur — hors ma boundary) ; (b) numéro d'ADR `0001` provisoire — la gouvernance ADR (V6.1 `docs-governance`, ≥6 ADRs) possède l'ensemble ADR et pourra renuméroter/croiser sans conflit de fichier (noms distincts).
- **Nuance honnête** : le `generate` du point 6 vise le schéma **principal** (Postgres) ; la 2ᵉ config (DO SQLite) applique ses migrations **au runtime** via `@Migratable` (`routes/agent/index.ts:337`), pas via drizzle-kit — sa cohérence est validée structurellement par `migrations-consistency` (1 sql / 1 journalled / 0 drift), pas par `generate`.
- **Pas de commit** (conforme). Deux builders en parallèle : fichiers disjoints, `.sql`/lockfile/workspace intouchés de mon côté.

STATUS: COMPLETE_WITH_CONCERNS (allowlist réduite et non vidée — imposé par la règle absolue anti-suppression/renumérotation, seconde branche explicite de l'acceptation, ruling D1 à confirmer ; branchement CI du check = handoff orchestrateur hors boundary .github ; numéro d'ADR 0001 provisoire vs gouvernance V6.1)
