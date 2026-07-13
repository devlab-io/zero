# Job niveau9/loc-outliers-01 — V3.5 loc-outliers (issue devlab-io/zero#41)

Worktree : `.architect/wt/niveau9/loc-outliers-01` — branche `job/niveau9/loc-outliers-01`
HEAD au démarrage : `ce0102157e1ebb94e21ab837d319bebe3d061bc7` (vérifié, concorde).

Découpage MÉCANIQUE de 3 god files sans owner. Comportement strictement inchangé, sites
d'import inchangés. Blocs source déplacés VERBATIM par générateur (aucune refrappe de JSX/logique).

---

## PHASE 0 — plan + désaccords (MIRROR: ORCHESTRATOR)

### Plan retenu
1. **icons.tsx (1783)** — 97 `export const` SVG purs, zéro import, zéro helper partagé, zéro
   type. Découpe par 8 familles cohérentes ; `icons.tsx` devient un barrel `export *`.
2. **contributors.tsx (1040)** — données + logique de fetch extraites vers **un seul** module
   adjacent `contributors-data.ts` ; le rendu JSX reste dans `contributors.tsx` (entrée de page,
   routing inchangé).
3. **note-panel.tsx (829)** — vue/logique séparées en 3 modules frères `note-panel*` :
   `note-panel-sortable-note.tsx` (vue), `note-panel-logic.ts` (hook logique), `note-panel.tsx`
   (vue/conteneur, garde `export function NotesPanel` → site d'import inchangé).
4. **loc-ratchet.mjs** — pruning des 3 entrées du budget (BORNES uniquement).

### Désaccords / clarifications de spec (cités sur fichiers réels) — MIRROR: ORCHESTRATOR

**D1 — contributors : « extraire les DONNÉES, pas restructurer le rendu » est mathématiquement
insuffisant pour passer sous 800.** Le composant `OpenPage` (`contributors.tsx:130-1040`) fait
911 LOC à lui seul ; le seul `return (…)` JSX fait ~659 LOC (`contributors.tsx:381-1039`).
Extraire uniquement les constantes/interfaces (`contributors.tsx:32-109`, ~78 LOC) laisse le
fichier à ~940 LOC — toujours > 800 (FAIL du check gelé §3). **Résolution :** j'extrais les
DONNÉES (interfaces + constantes) **et** la logique d'acquisition (queries/effects/memos,
`contributors.tsx:131-347`) dans `useContributorsData()`, tout en gardant le rendu JSX
**byte-identique** (assertion `src.includes(renderBlock)` = true). Le rendu n'est PAS restructuré ;
seule la logique est déplacée. C'est la seule lecture compatible à la fois avec « pas restructurer
le rendu » et « aucun module >800 ».

**D2 — « chaque fichier d'origine devient un barrel de ré-export » ne s'applique tel quel qu'à
icons.tsx.** Pour `contributors.tsx` (entrée de page Next/react-router avec `export default`) et
`note-panel.tsx` (conteneur `NotesPanel`, un seul consommateur : `thread-display.tsx:42`), un
barrel *vide* n'a pas de sens : le rendu doit vivre quelque part. Ces deux fichiers restent les
ENTRÉES (export public inchangé), les modules dérivés étant adjacents. Le principe réel — « sites
d'import inchangés » — est tenu dans les trois cas (snapshots ci-dessous, tous IDENTICAL).

**D3 — 3 entrées « prunable » résiduelles dans loc-ratchet appartiennent à d'autres jobs.**
`apps/server/src/routes/agent/index.ts` (25), `apps/server/src/routes/chat.ts` (absent),
`apps/server/src/main.ts` (333) ont fondu via des merges déjà dans HEAD (#22/#24…). Elles sont
sous `apps/server/**` = HORS mon périmètre (BOUNDARIES). Je NE les prune PAS ; loc-ratchet
PASSE quand même (prunable = info, pas un échec). Seules mes 3 cibles sont prunées.

**Aucun des 3 fichiers ne porte d'en-tête « Zero Email Inc. »** (vérifié :
`grep -l "Zero Email Inc" …` = vide). Aucun en-tête licence à propager sur les modules dérivés.

---

## Carte de découpage (LOC avant → après par module)

### icons.tsx — 1783 → barrel 10 LOC + 8 familles (97 icônes, bijection assertée)
| module | icônes | LOC |
|---|---|---|
| `icons.tsx` (barrel `export *`) | — | **10** |
| `brand-icons.tsx` | 13 | 258 |
| `mail-icons.tsx` | 15 | 268 |
| `file-icons.tsx` | 11 | 211 |
| `nav-icons.tsx` | 12 | 193 |
| `action-icons.tsx` | 18 | **294** (max) |
| `status-icons.tsx` | 11 | 199 |
| `people-icons.tsx` | 5 | 122 |
| `misc-icons.tsx` | 12 | 233 |

Familles : brand (services externes/logos), mail (actions thread), file (documents/dossiers),
nav (flèches/chevrons/panels), action (contrôles UI/édition), status (alertes/notifs), people
(personnes), misc (décoratif/objets). Chaque icône assignée à exactement une famille (le
générateur échoue sinon). Tous < 800.

### contributors.tsx — 1040 → 756 + module data 314
| module | LOC | rôle |
|---|---|---|
| `contributors.tsx` | **756** | entrée de page — rendu JSX **verbatim** + `ChartControls` + appel `useContributorsData()` |
| `contributors-data.ts` | 314 | interfaces + constantes (`excludedUsernames`, `coreTeamMembers`, `REPOSITORY`, `specialRoles`) + hook `useContributorsData()` (queries/effects/memos/fallback) |

### note-panel.tsx — 829 → 399 + logic 321 + sortable 192
| module | LOC | rôle |
|---|---|---|
| `note-panel.tsx` | **399** | vue/conteneur — `NotesPanel` (rendu **verbatim**) + `useNotesPanel()` |
| `note-panel-logic.ts` | 321 | hook `useNotesPanel(threadId)` — state, mutations tRPC, handlers, memos (LOGIQUE) |
| `note-panel-sortable-note.tsx` | 192 | `SortableNote` (VUE présentationnelle) |

**Module dérivé le plus gros : `action-icons.tsx` = 294 LOC.** Aucun module résultant > 800.

Fichiers changés (trackés) : `contributors.tsx`, `icons.tsx`, `note-panel.tsx`,
`scripts/checks/loc-ratchet.mjs` (BORNES) + 11 nouveaux modules dérivés. Aucun fichier hors
BOUNDARIES touché (vérifié `git status --porcelain`).

---

## Snapshots d'exports (contrat public avant/après)

```
### icons.tsx (barrel de 8 modules de famille)
BEFORE (97) / AFTER (97) — union des `export const` sur les 8 familles
missing: []   added: []   RESULT: IDENTICAL ✓

### note-panel.tsx
BEFORE (1): NotesPanel   AFTER (1): NotesPanel
missing: []   added: []   RESULT: IDENTICAL ✓

### contributors.tsx (export default)
BEFORE (2): (default), OpenPage   AFTER (2): (default), OpenPage
missing: []   added: []   RESULT: IDENTICAL ✓
```

0 changement de contrat d'export public sur les 3 barrels/entrées. Les modules dérivés
(`SortableNote`, `useNotesPanel`, `useContributorsData`, familles d'icônes) sont de NOUVEAUX
modules internes, hors du contrat des fichiers d'origine.

---

## Sorties verbatim

### tsc — `TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`
```
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   17 errors (baseline 17)
typecheck-report OK — no regression above baseline.
```
(séquence complète : `wrangler types` server+mail + `react-router typegen` avant tsc. server 0/0,
mail 17 = baseline exacte → mon refactor ajoute 0 erreur.)

### Build mail — `pnpm run build:frontend` (react-router build)
```
Prerender (html): /manifest.webmanifest -> build/client/manifest.webmanifest/index.html
Prerender (html): SPA Fallback -> build/client/index.html
✓ built in 8.87s
```

### Tests mail — `pnpm --filter @zero/mail test` (vitest run)
```
 ✓ components/queue/queue-view-model.test.ts (2 tests) 2ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### wrangler dry-run mail — `pnpm --filter @zero/mail exec wrangler deploy --dry-run`
```
Total Upload: 0.38 KiB / gzip: 0.27 KiB
No bindings found.
--dry-run: exiting now.
```

### loc-ratchet — `node scripts/checks/loc-ratchet.mjs` (rc=0)
```
loc-ratchet: files > 800 LOC = 10 (budget entries 13)
loc-ratchet: cross-app frontier imports = 5 (max 5)
loc-ratchet: 3 budget entries prunable (info):
  - apps/server/src/routes/agent/index.ts (now 25 <= 800)
  - apps/server/src/routes/chat.ts (no longer present)
  - apps/server/src/main.ts (now 333 <= 800)
loc-ratchet PASSED (no regression).
```
(budget 16 → 13 entrées : mes 3 cibles prunées — icons/contributors/note-panel. Les 3 prunable
résiduels appartiennent à `apps/server/**`, hors périmètre — cf. D3. frontier 5 inchangé.)

### structure.md RUN — frontier + top LOC
```
grep -rnE "(\.\./)+server/src" apps/mail … | wc -l  ->  5   (<= FRONTIER_MAX)
find … -exec wc -l {} + | sort -rn | head :
  1922 command-palette-context.tsx    (#28)
  1736 mail-display.tsx               (#26/#27)
  1332 HomeContent.tsx
  1293 microsoft.ts                   (ADR driver)
  1169 email-composer.tsx
  1096 mail-list.tsx
  1062 thread-display.tsx
   873 pipelines.ts
   870 mail.ts (trpc)
   849 mail.tsx
   766 workflow-functions.ts
   756 contributors.tsx               (ma cible — désormais < 800)
```
→ icons.tsx (10) et note-panel.tsx (399) hors top ; contributors.tsx (756) sous la borne.

### Licence — `grep -l "Zero Email Inc" <3 cibles>` = vide (aucun en-tête à propager).

### Lint (hors gate gelé, hygiène) — `eslint` sur les 14 fichiers touchés
14 erreurs, **toutes pré-existantes et déplacées verbatim**, 0 introduite :
- `brand-icons.tsx:208` `mask-type` (OutlookColor) — prouvé pré-existant : HEAD `icons.tsx:1038`
  porte la même erreur.
- `contributors.tsx` 13 × `jsx-no-target-blank` / `prop-types` — prouvé pré-existant : HEAD
  `contributors.tsx` en produit exactement 13 (lint stdin sur `git show HEAD:…`).
Aucun import inutilisé signalé sur mes listes d'imports écrites à la main (partitionnement propre).

---

## Vérification anti-duplication (check gelé §3)
- icons : chaque `export const` dans exactement une famille (bijection assertée par le générateur :
  `assigned.size === allExports.size`, 97 = 97).
- note-panel / contributors : blocs déplacés verbatim, aucun corps dupliqué entre modules
  (assertions `src.includes(block)` = true pour render/logic/sortable/data).

## Gates — récapitulatif
| Gate | Résultat |
|---|---|
| tsc (blocking) server 0/0, mail ≤17 | ✅ 0 / 17 |
| Build mail | ✅ built in 8.87s |
| Tests mail | ✅ 2/2 |
| wrangler dry-run mail | ✅ exiting now |
| loc-ratchet (3 entrées prunées) | ✅ PASSED |
| Contrat export public (3 snapshots) | ✅ IDENTICAL |
| Frontier `../server/src` | ✅ 5 (inchangé) |
| Licence | ✅ n/a (aucun en-tête) |
| Modules > 800 | ✅ aucun (max 294) |

Ne pas committer (per operating rules) — laissé au check-runner / juge froid.

STATUS: COMPLETE — 3 god files découpés mécaniquement (icons 1783→barrel+8 familles, contributors 1040→756+data, note-panel 829→399+logic+sortable), comportement/exports/imports inchangés, tous gates verts (tsc 0/17, build, tests 2/2, dry-run, loc-ratchet PASSED avec 3 entrées prunées).
