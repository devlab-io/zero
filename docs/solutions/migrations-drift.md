# Solution — dérive du journal Drizzle (migrations-repair, issue #19)

**Statut :** résolu par documentation + réparation du journal, **sans jamais toucher un `.sql`**.
**Périmètre :** `apps/server/src/db/migrations/` (Postgres, app principale).
**Check gelé :** `docs/checks/niveau9/data-config.md` points 1–4 + 6.
**Gate CI :** `scripts/checks/migrations-consistency.mjs` + `scripts/checks/migrations-allowlist.json`.

> **Règle de sécurité absolue de ce chantier.** Un fichier `.sql` de migration peut avoir
> été appliqué à une base réelle. On ne le **renumérote jamais**, on ne le **réécrit
> jamais**, on ne le **supprime jamais**. On répare le **journal** (`meta/_journal.json`)
> et on **documente** la dérive. `git diff` sur les `.sql` de ce chantier = **vide**.

---

## 1. État mesuré (gel du run, commit `a8ef30bc`)

- **42** fichiers `.sql` sur disque.
- **39** tags journalisés distincts dans `meta/_journal.json` (**40** entrées, car une est doublée — voir §5).
- **3** orphelins (fichier sur disque, pas de tag correspondant au journal).
- **4** groupes de préfixes numériques dupliqués : `0025`, `0029`, `0032`, `0035`.
- **1** trou dans la séquence des préfixes : `0037` (aucun fichier ne le porte).
- **1** doublon d'entrée au journal (`0032_add_image_compression_setting`, idx 32 **et** idx 33).

Baseline `drizzle-kit generate` sur le schéma courant : **« No schema changes, nothing to
migrate »**, `git status` vide → **drift schéma/migrations = 0** (voir §6).

## 2. Table de réconciliation `.sql` → statut

Chaque fichier `.sql` est soit **journalisé** (référencé par un tag de `meta/_journal.json`),
soit **orphelin → statué** (documenté ci-dessous en §4, autorisé durablement dans l'allowlist).

| # | fichier .sql | préfixe | statut | idx journal |
|---|---|---|---|---|
| 1 | `0000_fine_steel_serpent.sql` | 0000 | journalisé | 0 |
| 2 | `0001_greedy_darkhawk.sql` | 0001 | journalisé | 1 |
| 3 | `0002_flimsy_nightshade.sql` | 0002 | journalisé | 2 |
| 4 | `0003_purple_kylun.sql` | 0003 | journalisé | 3 |
| 5 | `0004_quiet_grey_gargoyle.sql` | 0004 | journalisé | 4 |
| 6 | `0005_mature_lady_deathstrike.sql` | 0005 | journalisé | 5 |
| 7 | `0006_small_unicorn.sql` | 0006 | journalisé | 6 |
| 8 | `0007_tense_wrecking_crew.sql` | 0007 | journalisé | 7 |
| 9 | `0008_freezing_hydra.sql` | 0008 | journalisé | 8 |
| 10 | `0009_boring_big_bertha.sql` | 0009 | journalisé | 9 |
| 11 | `0010_dry_hemingway.sql` | 0010 | journalisé | 10 |
| 12 | `0011_huge_newton_destine.sql` | 0011 | journalisé | 11 |
| 13 | `0012_even_johnny_storm.sql` | 0012 | journalisé | 12 |
| 14 | `0013_calm_timeslip.sql` | 0013 | journalisé | 13 |
| 15 | `0014_cuddly_energizer.sql` | 0014 | journalisé | 14 |
| 16 | `0015_minor_mister_sinister.sql` | 0015 | journalisé | 15 |
| 17 | `0016_neat_ogun.sql` | 0016 | journalisé | 16 |
| 18 | `0017_bouncy_shotgun.sql` | 0017 | journalisé | 17 |
| 19 | `0018_far_lady_mastermind.sql` | 0018 | journalisé | 18 |
| 20 | `0019_mean_war_machine.sql` | 0019 | journalisé | 19 |
| 21 | `0020_bright_gladiator.sql` | 0020 | journalisé | 20 |
| 22 | `0021_outgoing_mariko_yashida.sql` | 0021 | journalisé | 21 |
| 23 | `0022_round_violations.sql` | 0022 | journalisé | 22 |
| 24 | `0023_narrow_maria_hill.sql` | 0023 | journalisé | 23 |
| 25 | `0024_familiar_wiccan.sql` | 0024 | journalisé | 24 |
| 26 | `0025_far_echo.sql` | 0025 | **orphelin → statué** (§4.1) | — |
| 27 | `0025_nervous_paper_doll.sql` | 0025 | journalisé | 25 |
| 28 | `0026_smooth_norrin_radd.sql` | 0026 | journalisé | 26 |
| 29 | `0027_vengeful_golden_guardian.sql` | 0027 | journalisé | 27 |
| 30 | `0028_worried_molecule_man.sql` | 0028 | journalisé | 28 |
| 31 | `0029_common_network.sql` | 0029 | journalisé | 29 |
| 32 | `0029_thin_triathlon.sql` | 0029 | **orphelin → statué** (§4.2) | — |
| 33 | `0030_blue_grandmaster.sql` | 0030 | journalisé | 30 |
| 34 | `0031_legal_colleen_wing.sql` | 0031 | journalisé | 31 |
| 35 | `0032_add_image_compression_setting.sql` | 0032 | journalisé | 32, 33 ⚠️ doublon (§5) |
| 36 | `0032_smiling_raider.sql` | 0032 | **orphelin → statué** (§4.3) | — |
| 37 | `0033_first_bastion.sql` | 0033 | journalisé | 33 |
| 38 | `0034_mushy_runaways.sql` | 0034 | journalisé | 34 |
| 39 | `0035_giant_hydra.sql` | 0035 | journalisé | 35 |
| 40 | `0035_uneven_shiva.sql` | 0035 | journalisé | 37 |
| 41 | `0036_petite_mole_man.sql` | 0036 | journalisé | 36 |
| 42 | `0038_famous_malcolm_colcord.sql` | 0038 | journalisé | 38 |

**42 = 39 journalisés + 3 orphelins statués. Zéro fichier `.sql` non couvert.**

## 3. Diagnostic de fond : nature des 3 orphelins

Les trois orphelins sont **exactement une** instruction chacun, de la même forme :

```sql
ALTER TABLE "mail0_user_settings" ALTER COLUMN "settings" SET DEFAULT '{ … }'::jsonb;
```

C'est le cas d'orphelin **le moins dangereux qui soit**, pour trois raisons cumulées :

1. **Idempotent.** `SET DEFAULT` ne migre aucune donnée et n'exécute aucun DDL destructeur ;
   il réécrit seulement la valeur par défaut de la colonne.
2. **Last-writer-wins.** La valeur par défaut vivante est celle de la **dernière** migration
   `SET DEFAULT` appliquée. Toute migration `SET DEFAULT` journalisée postérieure **écrase**
   la valeur qu'un orphelin aurait pu poser.
3. **Schéma en phase.** `apps/server/src/db/schema.ts:197-200` définit
   `settings … .default(defaultUserSettings)`, et `drizzle-kit generate` ne produit **aucune**
   migration (§6). La valeur par défaut vivante **est déjà** celle de la chaîne journalisée.

**Conséquence de sécurité :** qu'un orphelin ait été appliqué ou non sur tel ou tel
environnement est **sans effet** sur le schéma courant — sa valeur par défaut a de toute façon
été recouverte par une migration `SET DEFAULT` journalisée ultérieure. Aucun état divergent ni
destructeur n'est possible. Les **journaliser** serait donc **faux** (les faire passer pour des
maillons de la lignée appliquée, alors qu'ils ne le sont pas), et les **supprimer** est interdit
par la règle absolue. La posture correcte est : **les laisser sur disque, non journalisés,
documentés ici, autorisés durablement dans l'allowlist**.

## 4. Statut détaillé par orphelin (décision + preuve)

<a id="orphan-0025_far_echo"></a>
### 4.1 `0025_far_echo.sql` — **doublon de contenu subsumé** (mort)

- **Origine git :** créé le **2025-04-09** par le commit `4377e042`
  *« Add function to handle golden ticket feature »* — une branche longue qui a généré ses
  migrations sur le compteur de préfixes d'alors.
- **Jumeau de préfixe (journalisé) :** `0025_nervous_paper_doll.sql` (idx 25), créé
  **plus tard**, le **2025-04-30**, par `e1deecc9` sur la ligne principale.
- **Diff de contenu :** l'orphelin est **une** instruction ; le jumeau en contient **quatre**
  (DROP FK → `SET DEFAULT` → ADD FK). L'unique instruction de l'orphelin est
  **byte-identique** à l'une des instructions du jumeau :

  ```
  # diff 0025_far_echo (orphan)  vs  0025_nervous_paper_doll (journaled)
  < ALTER TABLE "mail0_user_settings" ALTER COLUMN "settings" SET DEFAULT '{…"colorTheme":"system"}'::jsonb;
  ---
  > ALTER TABLE "mail0_writing_style_matrix" DROP CONSTRAINT "…_connection_id_fk";
  > ALTER TABLE "mail0_user_settings" ALTER COLUMN "settings" SET DEFAULT '{…"colorTheme":"system"}'::jsonb;   ← identique
  > ALTER TABLE "mail0_writing_style_matrix" ADD CONSTRAINT "…_connection_id_fk" FOREIGN KEY …;
  ```

  Preuve : `grep -Fq` de l'instruction de l'orphelin dans le jumeau → **trouvée**.
- **Verdict :** **doublon de contenu, entièrement subsumé** par le jumeau journalisé. L'effet
  de l'orphelin est un sous-ensemble strict de celui du jumeau. **Mort.** On conserve le fichier
  (immutabilité), on ne le journalise pas (redondant), on l'autorise dans l'allowlist.

<a id="orphan-0029_thin_triathlon"></a>
### 4.2 `0029_thin_triathlon.sql` — **branche divergente `autoRead`, superseded** (mort)

- **Origine git :** créé le **2025-04-09** par le **même** commit `4377e042` (branche
  « golden ticket ») que `0025_far_echo`.
- **Jumeau de préfixe (journalisé) :** `0029_common_network.sql` (idx 29), créé **plus tard**,
  le **2025-06-18**, par `b048c742` *« Hotfix (#1358) »*.
- **Diff de contenu :** divergent — l'orphelin ajoute la clé **`autoRead`** ; le jumeau ajoute
  la clé **`categories`** (6 catégories). Deux lignes de développement parallèles.

  ```
  < …"zeroSignature":true,"autoRead":true}                         (orphelin — ligne autoRead)
  ---
  > …"zeroSignature":true,"categories":[ … 6 catégories … ]}       (jumeau journalisé)
  ```
- **Verdict :** **superseded.** La valeur par défaut posée par l'orphelin (`autoRead`) n'est
  pas la valeur de la lignée journalisée à cet index ; la clé `autoRead` réapparaît d'ailleurs
  plus loin (dans l'orphelin `0032_smiling_raider`, §4.3) — la fonctionnalité a suivi son
  propre chemin d'orphelins. Le `SET DEFAULT` de l'orphelin est de toute façon recouvert par
  chaque `SET DEFAULT` journalisé ultérieur. **Mort.** Conservé, non journalisé, autorisé.

<a id="orphan-0032_smiling_raider"></a>
### 4.3 `0032_smiling_raider.sql` — **PR auto-read #1473 collisionnée, superseded** (mort)

- **Origine git :** créé le **2025-06-24** par `8d2a00d9`
  *« [ZERO-170] Toggle for 'Auto-read' emails (#1473) »*.
- **Jumeau de préfixe (journalisé) :** `0032_add_image_compression_setting.sql` (idx 32),
  créé **avant**, le **2025-06-19**, par `7db4b08c` *« Fixes (#1397) »*.
- **Diff de contenu :** divergent — l'orphelin porte **`autoRead`** (sans `imageCompression`) ;
  le jumeau porte **`imageCompression":"medium"`** (sans `autoRead`).

  ```
  < …"zeroSignature":true,"autoRead":true,"defaultEmailAlias":"","categories":[ … ]}          (orphelin — #1473)
  ---
  > …"zeroSignature":true,"defaultEmailAlias":"","categories":[ … ],"imageCompression":"medium"}   (jumeau — #1397)
  ```
- **Verdict :** **superseded.** Le préfixe `0032` était déjà pris par `#1397` (5 jours avant) au
  moment où `#1473` a généré sa migration ; celle-ci a collisionné et n'a jamais été journalisée.
  Le `SET DEFAULT` `autoRead` a été recouvert par la lignée journalisée. **Mort.** Conservé, non
  journalisé, autorisé.

## 5. Trou `0037`, préfixes dupliqués & doublon de journal — origine et prévention

### 5.1 Origine (git : merges/rebases concurrents)

drizzle-kit numérote une nouvelle migration en scannant les fichiers existants et en
**incrémentant le plus grand préfixe**. Ce compteur **ignore les branches** : deux branches
parties du même point choisissent **le même prochain numéro**, en toute indépendance. Au merge,
git conserve les deux fichiers **sans jamais renuméroter**. D'où :

<a id="prefix-0025"></a>
- **Préfixe `0025` dupliqué** — `0025_far_echo` (branche golden-ticket, 2025-04-09) vs
  `0025_nervous_paper_doll` (main, 2025-04-30). Un orphelin + un journalisé (§4.1).

<a id="prefix-0029"></a>
- **Préfixe `0029` dupliqué** — `0029_thin_triathlon` (branche golden-ticket, 2025-04-09) vs
  `0029_common_network` (main hotfix #1358, 2025-06-18). Un orphelin + un journalisé (§4.2).

<a id="prefix-0032"></a>
- **Préfixe `0032` dupliqué** — `0032_smiling_raider` (PR #1473 auto-read, 2025-06-24) vs
  `0032_add_image_compression_setting` (PR #1397, 2025-06-19). Un orphelin + un journalisé (§4.3).

<a id="prefix-0035"></a>
- **Préfixe `0035` dupliqué** — `0035_giant_hydra` (idx 35, `when` 1751340197573) vs
  `0035_uneven_shiva` (idx **37**, `when` 1751568728663). **Les deux sont journalisés et
  appliqués** ; c'est une collision de préfixe **bénigne** (aucun orphelin). `0035_uneven_shiva`
  a été généré sur une branche où le dernier préfixe vu était `0034`, puis mergé **après** que
  main eut déjà consommé `0035` et `0036` — d'où son idx 37 en fin de journal.

- **Trou de préfixe `0037`** — conséquence directe de la collision `0035`. `0035_uneven_shiva`
  occupe l'idx 37 du journal mais **garde son nom de fichier `0035_…`** ; le fichier suivant
  saute à `0038_famous_malcolm_colcord`. **Aucun fichier ne porte le préfixe `0037`** : il n'y a
  donc **rien à réparer** (pas de fichier manquant, pas d'entrée manquante) — seulement à
  documenter. Le check `migrations-consistency` ne vérifie d'ailleurs pas les trous, uniquement
  orphelins / entrées-sans-fichier / préfixes dupliqués.

### 5.2 Doublon d'entrée au journal `0032_add_image_compression_setting`

Le journal contenait **deux** entrées pour le même tag `0032_add_image_compression_setting`
(idx 32 **et** idx 33), avec un `when` **identique** (`1750648088006`), suivies d'une **seconde**
entrée idx 33 pour `0033_first_bastion`. C'est un artefact de merge (l'entrée `0032` a été
recopiée au lieu que le compteur d'idx avance).

**Réparation appliquée à `meta/_journal.json` :** suppression de **l'unique** entrée `0032`
dupliquée (idx 33, `when 1750648088006`). C'est une **correction d'entrée** (dé-duplication),
**pas une renumérotation** : `0033_first_bastion` **conserve** son idx 33, et toute la suite
(0034 → idx 34, 0035_uneven_shiva → idx 37, 0038 → idx 38) est **inchangée**. Aucun `.sql`
n'est touché. Innocuité prouvée par `drizzle-kit generate` avant/après (§6) : sortie identique,
`git status` vide sur les `.sql`.

> Note migrator : même **avant** cette réparation, le doublon était inoffensif à l'exécution —
> le migrator Drizzle applique les entrées dont `when` est **strictement supérieur** au dernier
> `when` appliqué ; la seconde entrée `0032` (même `when`) était donc déjà ignorée. La
> réparation aligne néanmoins le journal sur le disque (39 tags ↔ 39 entrées).

### 5.3 Règle de prévention (à respecter par toute l'équipe)

1. **Les préfixes sont générés, jamais édités à la main.** On crée une migration **uniquement**
   via `pnpm --filter @zero/server db:generate` (drizzle-kit). On ne renomme jamais un `.sql`
   ni son préfixe.
2. **Rebaser AVANT de générer.** Avant `db:generate`, se resynchroniser sur la branche cible
   (`git pull --rebase`) pour que le compteur de préfixes voie les dernières migrations mergées.
   Une PR dont la migration a un préfixe déjà pris sur la cible **doit régénérer** sa migration
   après rebase (supprimer le fichier local non encore mergé et relancer `db:generate`).
3. **Une migration appliquée est immuable.** On ne **renumérote / réécrit / supprime jamais** un
   `.sql` déjà mergé (potentiellement appliqué en prod). Une dérive résiduelle se **documente
   ici** et s'autorise dans l'allowlist — elle ne se « corrige » pas en touchant les `.sql`.
4. **Le journal ne se dé-double qu'en ajout/correction**, jamais en renumérotation d'entrées
   existantes pointant des fichiers appliqués.
5. **CI garde-fou.** `scripts/checks/migrations-consistency.mjs` échoue sur toute **nouvelle**
   dérive (orphelin, entrée-sans-fichier, préfixe dupliqué) hors allowlist documentée — voir §7.

## 6. Vert de bout en bout — `drizzle-kit generate`

Sur le schéma courant, avant et après la réparation du journal, `drizzle-kit generate` renvoie
**« No schema changes, nothing to migrate 😴 »** et **`git status` reste vide** (aucun `.sql`
ni snapshot généré). **Drift schéma/migrations = 0.** Sorties verbatim conservées au rapport de
job `docs/jobs/niveau9/migrations-repair-01.md`.

## 7. Allowlist durable & gate CI

Comme la règle absolue interdit de supprimer les orphelins ou de renuméroter les préfixes, la
dérive documentée ici est **structurellement permanente** : l'allowlist ne peut pas être *vidée*,
elle est **réduite aux seules exceptions durablement documentées**, chacune **liée à sa section
de ce document** et **vérifiée automatiquement** par le script.

`scripts/checks/migrations-allowlist.json` (forme référencée) autorise exactement :

- **Orphelins** : `0025_far_echo` (§4.1), `0029_thin_triathlon` (§4.2), `0032_smiling_raider` (§4.3).
- **Préfixes dupliqués** : `0025` (§5.1), `0029` (§5.1), `0032` (§5.1), `0035` (§5.1).

`scripts/checks/migrations-consistency.mjs` exige que **chaque** exception restante pointe vers
une ancre existante de ce fichier (`docs/solutions/migrations-drift.md#…`) ; une exception sans
référence résolvable **fait échouer le check**. Toute **nouvelle** dérive hors allowlist échoue
également. Voir la config `apps/server/drizzle.config.ts` et la 2ᵉ config statuée en ADR
`docs/adr/0001-second-drizzle-config-durable-objects-sqlite.md`.
