# Job niveau9/shared-types-package-01 — Issue devlab-io/zero#25 (V2.4 shared-types-package)

MIRROR: ORCHESTRATOR
Worktree : `/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/shared-types-package-01`
Branche : `job/niveau9/shared-types-package-01` · HEAD `13911b6b3a431c6b18c61e91a72257bae73fcb8a` (vérifié, aucune divergence)
Séquence de mesure (worktree fraîchement installé) : `pnpm install --frozen-lockfile` + `wrangler types --env local` (server) + `wrangler types` (mail) + `react-router typegen` (mail).

---

## PHASE 0 — Plan + désaccords (citant fichiers réels)

### Plan
1. `@zero/types` = package source (runtime : enums + prompts + types). Contrats déplacés une fois, ré-export arrière côté serveur.
2. Rewire les 5 imports relatifs mail → `@zero/types` (→ frontière grep = 0).
3. Règle ESLint `no-restricted-imports` (`**/server/src/**`) + preuve par violation.
4. Borne `loc-ratchet FRONTIER_MAX 5 → 0`.
5. Frontière `AppRouter` (gate `tsc mail = 0`) : mécanisme à choisir.
6. ADR + rapport + toutes les vérifs (tests, build, dry-run ×2, agent-surface, server tsc 0).

### Désaccords (MIRROR: ORCHESTRATOR) — chacun mesuré, cité, puis continué

**D1 — Le résidu de 17 n'est PAS « 100 % via l'import AppRouter » (spec + `typecheck-report.mjs:23`).**
Mesuré en neutralisant les ponts un par un (worktree neuf, séquence complète) :
- `@zero/server/trpc` (`AppRouter`) coupé, `@zero/server/auth` (`Auth`) réel → **17** erreurs `../server/src`.
- `AppRouter` réel, `@zero/server/auth` coupé → **17**.
- les deux coupés → **0**.
⇒ `@zero/server/trpc` **et** `@zero/server/auth` tirent **chacun indépendamment** le graphe serveur profond. Racine (`tsc --explainFiles`) : `apps/server/src/env.ts:1-2` `import type … from './main'` / `'./routes/agent'` (classes Durable Object), `env.ts` étant foundational. Fichiers hors MAY TOUCH (`env.ts`, `main.ts`=#24, `routes/agent`=#22).

**D2 — Aucune déclaration `AppRouter`/`Auth` n'est émissible (bloque l'option « dts émis » du spec).**
`tsc --emitDeclarationOnly` (avec/sans `isolatedModules`/`verbatimModuleSyntax`, `noEmitOnError:false`) et `rollup-plugin-dts` échouent tous : `TS2742`/`TS4023` sur `serverTrpc` (`apps/server/src/trpc/index.ts:48`), `privateProcedure`/`activeConnectionProcedure`/`activeDriverProcedure` (`apps/server/src/trpc/trpc.ts:25,59,99`), `createAuth` (`apps/server/src/lib/auth.ts:160`). Cause : `zod@4.4.3` (v4 bundlée par better-auth vs repo en zod v3) via `zod/v4/core`, et `MCPOptions` (`better-auth/dist/plugins/mcp`) non-nommables. Fichiers hors MAY TOUCH.

**D3 — Conséquence : le gate `tsc mail = 0 TOTAL` (et `BASELINE.mail 17 → 0`) est hors périmètre de #25.** Détail + ruling demandé dans `docs/adr/0004-shared-types-package.md` §« Ruling demandé ». `BASELINE.mail` laissé à **17** (ratchet honnête, aucune régression) plutôt qu'abaissé à 0 (check rouge). Tout le reste de #25 est livré et vert (ci-dessous).

---

## PHASE 1 — Checks lus (read-only, non modifiés)

- `docs/checks/niveau9/typecheck.md` (v3, freeze) : gate #25 = `pnpm --filter @zero/mail exec tsc --noEmit` = **0 TOTAL** ; server strict = 0.
- `docs/checks/niveau9/structure.md` §6 : `grep -rnE "(\.\./)+server/src" apps/mail = 0` ; `no-restricted-imports` présent + violé = rouge (preuve par violation) ; loc-ratchet borne ne croît pas ; contrat public identique ; pas de duplication.
Aucun fichier `docs/checks/` touché.

---

## PHASE 2 — Réalisé

### Architecture — Décision 1 : `@zero/types` émet du runtime JS (cf. ADR 0004)
Consommé comme source `.ts` (`exports: { ".": "./src/index.ts" }`), bundlé par les deux apps — pas de `dist/`, pas d'étape build. Porte des **valeurs runtime** (enums `EPrompts`/`Tools`, const prompts) → ne peut être `.d.ts`-only. `tsconfig` hérite de base + `noUncheckedIndexedAccess`. `tsc @zero/types = 0`.

### Architecture — Décision 2 : frontière `AppRouter`/`Auth` (cf. ADR 0004, alternatives rejetées)
Émission `.d.ts` (rejet : TS2742) · bundler dts (rejet : TS2742) · frontière `paths` (rejet : arêtes relatives non-interceptables ; stub `@zero/server/*` = perte de typage, 395 erreurs) · package de types dédié (rejet : `typeof appRouter` non déplaçable) · fusion d'Env (rejet : sens inverse + incomplet 17→2). Shim `dormroom` (mail tsconfig) **conservé** — vérifié toujours vivant.

### Inventaire déplacements / ré-exports arrière
| Contrat | Origine | Destination | Ré-export arrière |
|---|---|---|---|
| `ParsedMessage`, `ParsedMessageSchema` | `apps/server/src/types.ts` | `packages/types/src/message.ts` | `types.ts` : `export { ParsedMessageSchema }` + `export type { ParsedMessage }` |
| `EPrompts`, `Tools` (enums) | `apps/server/src/types.ts` | `packages/types/src/enums.ts` | `types.ts` : `export { EPrompts, Tools }` |
| `IGetThreadResponse`, `IGetThreadResponseSchema`, `ParsedDraft` | `apps/server/src/lib/driver/types.ts` | `packages/types/src/driver.ts` | `driver/types.ts` : `export { IGetThreadResponseSchema }` + `export type { IGetThreadResponse, ParsedDraft }` |
| `SummarizeMessage`, `SummarizeThread`, `ReSummarizeThread` (const) | `apps/server/src/lib/brain.fallback.prompts.ts` | `packages/types/src/fallback-prompts.ts` (byte-identiques) | `brain.fallback.prompts.ts` : `export { … } from '@zero/types'` (`ThreadLabels` reste local) |

Contrat public de module **identique** avant/après (mêmes noms/types ré-exportés). Piège enum/const respecté : tous les sites d'import mail restent des imports **valeur** (`EPrompts`/`Tools`/prompts), seuls `ParsedDraft`/`IGetThreadResponse` sont `import type`.

### 5 imports percés supprimés → `@zero/types`
`prompts-dialog.tsx` (:9-13 prompts, :27 EPrompts), `ai-sidebar.tsx` (:11 Tools), `mail-list.tsx` (:23 ParsedDraft), `use-threads.ts` (:3 IGetThreadResponse).

---

## Sorties verbatim

### tsc ×2 (séquence complète)
```
# pnpm --filter @zero/server exec tsc --noEmit  → server errors: 0
# pnpm --filter @zero/mail   exec tsc --noEmit  → mail total: 17  (server/src: 17 — inchangé, gate bloqué D3)
# node scripts/checks/typecheck-report.mjs
typecheck-report [mode=report]
  server: 0 errors (baseline 0)
  mail:   17 errors (baseline 17)
typecheck-report OK — no regression above baseline.
# pnpm --filter @zero/types exec tsc --noEmit  → 0 (noUncheckedIndexedAccess)
```

### Frontière (grep gelé, structure.md §6)
```
# grep -rnE "(\.\./)+server/src" apps/mail --include='*.ts' --include='*.tsx' | wc -l
0
```

### loc-ratchet (FRONTIER_MAX 5 → 0)
```
loc-ratchet: files > 800 LOC = 16 (budget entries 16)
loc-ratchet: cross-app frontier imports = 0 (max 0)
loc-ratchet PASSED (no regression).
```

### Preuve ESLint `no-restricted-imports` (par violation puis retrait)
```
# fichier propre (hooks/use-threads.ts) : 0 error no-restricted-imports (1 warning pré-existant sans rapport)
# après import factice `import { foo } from '../../server/src/lib/driver/types';` :
  4:1  error  '../../server/src/lib/driver/types' import is restricted from being used by a pattern.
        Frontière front→serveur : importez les contrats partagés depuis @zero/types, pas les sources
        @zero/server via un chemin relatif (issue #25)   no-restricted-imports
# import factice retiré → 0 violation.
```
Règle dans `packages/eslint-config/config.ts` (pattern `**/server/src/**` ; ne matche pas les sous-chemins publics `@zero/server/*`). Vérifié : aucun autre import `server/src` dans `apps`/`packages`.

### Tests / build / dry-run / sécurité
```
# pnpm --filter @zero/mail   test  → Test Files 1 passed, Tests 2 passed
# pnpm --filter @zero/server test  → Test Files 2 passed, Tests 7 passed
# pnpm --filter @zero/mail   build (react-router build) → ✓ built in 8.84s
# pnpm --filter @zero/server exec wrangler deploy --dry-run --env local → Total Upload: 21894.79 KiB ; --dry-run: exiting now  (exit 0)
# pnpm --filter @zero/mail   exec wrangler deploy --dry-run → Total Upload: 0.38 KiB ; --dry-run: exiting now  (exit 0)
# node scripts/security/check-agent-surface.mjs → Security surface check passed  (exit 0)
# node scripts/checks/console-ratchet.mjs → exit 0
# pnpm install --frozen-lockfile → exit 0 (lockfile reproductible)
```
Note dry-run serveur : `--env local` requis (config `.sql` loader) — l'échec sans env est **pré-existant** (fichier `routes/agent/db/drizzle/migrations.js`, hors périmètre), non causé par `@zero/types`.

### Non-régression lint (fichiers édités : HEAD vs après)
```
prompts-dialog.tsx : HEAD 4 → après 3   (améliore)
ai-sidebar.tsx     : HEAD 4 → après 4   (inchangé — useState/useEffect orphelins pré-existants)
mail-list.tsx      : HEAD 2 → après 2   (inchangé)
use-threads.ts     : HEAD 1 → après 1   (inchangé)
```
Zéro nouvelle erreur lint. Logique des composants inchangée (imports seulement).

### Shim dormroom — vérifié vivant (donc conservé)
```
# mail tsconfig SANS le shim dormroom : tsc mail = 37 (dont 6 erreurs dormroom node_modules)
# avec shim : 17. → shim nécessaire tant que la frontière AppRouter/Auth n'est pas coupée.
```

---

## Acceptation — bilan

| Critère #25 | État |
|---|---|
| `packages/types` créé (@zero/types, hérité + noUncheckedIndexedAccess, émet runtime) | ✅ |
| Contrats déplacés / ré-exportés (contrat public identique) | ✅ |
| 5 imports percés supprimés → `@zero/types` | ✅ |
| Piège enum/const (imports valeur préservés) | ✅ |
| `grep (\.\./)+server/src apps/mail = 0` | ✅ |
| Règle ESLint `no-restricted-imports` active + preuve par violation | ✅ |
| `loc-ratchet FRONTIER_MAX 5 → 0` (passe) | ✅ |
| `tsc server = 0` ; tests verts ; build mail vert ; dry-run wrangler ×2 verts ; check-agent-surface vert ; frozen install vert | ✅ |
| ADR (types partagés + frontière + alternatives rejetées) | ✅ `docs/adr/0004` |
| **`tsc mail = 0 TOTAL` (gate dur)** | ⛔ **BLOQUÉ** (D1/D2/D3 — hors périmètre) |
| **`typecheck-report BASELINE.mail 17 → 0`** | ⛔ laissé à 17 (honnête ; abaisser = check rouge) |

Aucun commit effectué. Fichiers hors périmètre non touchés (`trpc/routes/**`, `main.ts`, `routes/{chat,ai,autumn}.ts`, `routes/agent/**`, `env.ts`, `docs/checks/**`, `.github/**`).

---

STATUS (pré-rebase, base 13911b6b — superseded par le ruling freeze/niveau9-v4 : gate `tsc mail=0` transféré à l'issue #43 ; voir section « Re-mesure post-rebase » ci-dessous pour le STATUS final) : BLOCKED — @zero/types + frontière des 5 imports relatifs (grep 0) + règle ESLint (prouvée) + FRONTIER_MAX 5→0 + server tsc 0 / tests / build / dry-run ×2 / agent-surface : TOUS livrés et verts ; le gate dur `tsc mail = 0 TOTAL` est hors périmètre (17 tirés indépendamment par `@zero/server/trpc` ET `@zero/server/auth` via `env.ts→main.ts/routes-agent` ; émission `.d.ts` impossible TS2742 zod-v4/better-auth) → ruling orchestrateur requis (ADR 0004).

---

## Re-mesure post-rebase (base c6a4d0ca)

Ruling **freeze/niveau9-v4** : le gate `tsc mail = 0 TOTAL` m'est officiellement **retiré** — transféré à l'issue corrective **#43 trpc-type-boundary** (preuves : ADR 0004 + contre-preuve #29 « découplage env.ts non viable, 0→76 : `sync.ts:99`/`pipelines.ts` exigent les types DO concrets »). `BASELINE.mail` reste à **17**. Je suis jugé sur mon périmètre livré.

Branche rebasée sur `c6a4d0ca` (factory head : #22 agent 12 modules, #24 main 333/chat supprimé, #29 guardrails env-zod/logger, #41 loc-outliers). Mon travail est committé : `18b7d5bf` (git status propre). Re-mesure sur base rebasée, séquence complète (`pnpm install --frozen-lockfile` + `wrangler types --env local`/`wrangler types` + `react-router typegen`) :

```
# (1) pnpm --filter @zero/mail exec tsc --noEmit  → 17 erreurs
#     ventilation : apps/mail = 0 · ../server/src = 17 (le résidu #43, inchangé en nombre)
#     par fichier serveur :
        8  ../server/src/thread-workflow-utils/workflow-functions.ts
        4  ../server/src/lib/bulk-delete.ts
        3  ../server/src/routes/agent/mcp.ts
        1  ../server/src/routes/agent/db/drizzle/migrations.js
        1  ../server/src/routes/agent/chat-agent.ts
#     (glissement vs pré-rebase : l'unique erreur agent/index.ts:2175 est désormais dans
#      agent/chat-agent.ts — #22 a éclaté index.ts en 12 modules. Total identique = 17.)

# (2) pnpm --filter @zero/server exec tsc --noEmit  → 0
# (2b) pnpm --filter @zero/types exec tsc --noEmit  → 0

# (3) pnpm test
#     @zero/mail   : Test Files 1 passed, Tests 2 passed
#     @zero/server : Test Files 5 passed, Tests 23 passed   (#29 a ajouté des tests)

# (4) pnpm --filter @zero/mail build (react-router build)  → ✓ built in 10.62s

# (5a) node scripts/checks/typecheck-report.mjs   (BLOQUANT) → OK
      typecheck-report [mode=report]
        server: 0 errors (baseline 0)
        mail:   17 errors (baseline 17)
      typecheck-report OK — no regression above baseline.

# (5b) node scripts/checks/loc-ratchet.mjs         (BLOQUANT) → FAILED (1)
      loc-ratchet: files > 800 LOC = 10 (budget entries 10)
      loc-ratchet: cross-app frontier imports = 0 (max 0)
      loc-ratchet FAILED (1):
        - GREW past budget: apps/server/src/pipelines.ts = 874 LOC > budget 873

# (6) grep -rnE "(\.\./)+server/src" apps/mail --include='*.ts' --include='*.tsx' | wc -l  → 0

# (7) node scripts/security/check-agent-surface.mjs  → Security surface check passed (exit 0)
```

### Analyse du seul rouge — `loc-ratchet` (hors périmètre #25, non causé par ce job)

- `apps/server/src/pipelines.ts` = **874 LOC** > borne **873**. Ce fichier n'est **pas** dans mes fichiers édités ; mon commit `18b7d5bf` (22 fichiers) ne le touche pas.
- Dernier auteur : **#29** (`063fd425` guardrails — logger/taxonomie erreurs/tracing OTel ont ajouté la ligne). Preuve : au factory head `c6a4d0ca` (avant mon commit), `pipelines.ts` mesure déjà **874** alors que la borne y est **873** → **loc-ratchet échoue déjà à `c6a4d0ca`, sans moi**.
- Cause : dérive de borne d'intégration — le re-snapshot LOC de l'orchestrateur (`4b577c2d` « prune bornes ») a pruné agent/index, chat, main (#22/#24/#41) mais n'a pas monté `pipelines.ts` 873→874 pour la croissance PASS-mergée de #29.
- Je **ne corrige pas** : monter la borne serait l'**élargir** (interdit : « bornes jamais élargies »), et `pipelines.ts` n'est pas dans mon périmètre. **Handoff orchestrateur** : re-snapshot `pipelines.ts` 873→874 (croissance de #29, jugé PASS), comme pour les autres bornes montées par merges PASS.

### Bilan périmètre #25 (rebasé)
Tous mes livrables verts : `@zero/types` (tsc 0) · 5 imports relatifs → 0 (frontière grep 0) · règle ESLint active · `FRONTIER_MAX 5→0` (part frontière loc-ratchet = 0/0) · `tsc server = 0` · `tsc mail` : **0 dans apps/mail** (17 résiduels 100 % `../server/src` = gate #43) · tests · build · typecheck-report · check-agent-surface. Aucun fichier de #29/#22/#24 touché. Pas de commit (l'orchestrateur committera).

---

STATUS: COMPLETE_WITH_CONCERNS — périmètre #25 entièrement livré et vert sur la base rebasée c6a4d0ca (package @zero/types, frontière relative 0 + ESLint prouvé, FRONTIER_MAX 5→0, server tsc 0, apps/mail tsc 0, tests, build, typecheck-report, check-agent-surface) ; gate `tsc mail=0` retiré (→ #43, 17 résiduels 100 % ../server/src). SEUL concern, hors périmètre : `loc-ratchet` rouge sur `apps/server/src/pipelines.ts` 874>873 — croissance PASS-mergée de #29 (déjà rouge au factory head c6a4d0ca), borne non re-snapshotée ; handoff orchestrateur (re-snapshot 873→874), non élargie par moi.

---

## Addendum orchestrateur — base f360e301 (supersede la section « Re-mesure post-rebase (base c6a4d0ca) »)

L'analyse loc-ratchet de la section précédente est **SUPERSEDED** : la branche a été
re-rebasée sur `f360e301`, qui corrige le blocker en AMONT par un micro-commit non
fonctionnel (`pipelines.ts` 874→873, fusion des deux imports `./types` — la croissance
venait d'un import logger net de #29). **La borne 873 n'a PAS été élargie** — la
recommandation « re-snapshot 873→874 » de la section précédente est caduque et n'a pas
été suivie (élargir eût été illégal, le builder avait raison de ne pas le faire lui-même).

État re-vérifié sur la base f360e301 (checkrun `f15b92b4`, juge froid) :
- `node scripts/checks/loc-ratchet.mjs` → **PASSED** (10/10 budget, frontier 0/0).
- Tous les autres gates inchangés et verts (tsc server 0, apps/mail 0 propre,
  17 résiduels 100 % ../server/src → gate #43 par freeze v4, tests, build,
  dry-run ×2, ESLint prouvé, check-agent-surface).

STATUS: COMPLETE — périmètre #25 entièrement livré et vert sur base f360e301,
conforme freeze/niveau9-v4 (gate `tsc mail = 0 TOTAL` transféré nominalement à #43 ;
BASELINE.mail 17 maintenu). Aucun concern résiduel.
