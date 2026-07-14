# ADR 0004 — `@zero/types` : package de contrats partagés front↔serveur (V2.4)

Statut : Accepté (partie « package ») · **Ruling orchestrateur requis** (partie « frontière AppRouter/Auth »)
Date : 2026-07-13
Issue : devlab-io/zero#25 — [niveau9] V2.4 shared-types-package
Contexte de mesure : worktree `job/niveau9/shared-types-package-01`, HEAD `13911b6b`,
séquence complète (`pnpm install --frozen-lockfile` + `wrangler types` ×2 + `react-router typegen`).

## Contexte

`apps/mail` perçait la frontière serveur par **5 imports relatifs** `../server/src/**` pour
consommer des contrats partagés (`IGetThreadResponse`, `ParsedDraft`, `EPrompts`, `Tools`,
et les 3 prompts fallback). Ces imports tirent les sources serveur dans le programme `tsc`
de mail. Objectif #25 : créer `@zero/types`, rapatrier les contrats, rendre la frontière
étanche, et amener `tsc --filter @zero/mail = 0 TOTAL`.

## Décision 1 — `@zero/types` émet du **runtime JS**, pas un `.d.ts` pur

Le package `packages/types` (`@zero/types`) est consommé **comme source `.ts`** via
`exports: { ".": "./src/index.ts" }` — exactement comme les sous-chemins `@zero/server/*`
existants. Les bundlers des deux apps (Vite/react-router côté mail, esbuild/wrangler côté
serveur) compilent le `.ts` : **aucune étape de build dédiée, aucun `dist/` à committer**
(reproductible par construction, cf. `.gitignore` ignore `dist`/`build`).

`@zero/types` ne peut PAS être un package de types pur (`.d.ts`-only) car il porte des
**valeurs runtime** :
- `EPrompts`, `Tools` — enums **runtime** (pas `const enum`, pas type-only). Passer un
  site d'import à `import type` les effacerait et casserait le runtime (`Tools.GetThread`,
  `EPrompts.SummarizeMessage`, comparaisons d'enum côté serveur).
- `SummarizeMessage` / `SummarizeThread` / `ReSummarizeThread` — `const` (dedent) évaluées
  au runtime (affichées dans le dialog prompts côté mail ; fallback des prompts côté serveur).

Contenu (une seule définition, zéro duplication — structure.md §3) :
- `src/message.ts` — `ParsedMessage` + `ParsedMessageSchema` (déplacés depuis `apps/server/src/types.ts`).
- `src/driver.ts` — `IGetThreadResponse` (+ `IGetThreadResponseSchema`), `ParsedDraft`
  (déplacés depuis `apps/server/src/lib/driver/types.ts`). `IGetThreadResponse.messages`
  référence `ParsedMessage` → d'où le rapatriement de `ParsedMessage` ci-dessus.
- `src/enums.ts` — `EPrompts`, `Tools` (déplacés depuis `apps/server/src/types.ts`).
- `src/fallback-prompts.ts` — les 3 prompts (déplacés byte-identiques depuis
  `apps/server/src/lib/brain.fallback.prompts.ts` ; `ThreadLabels` reste serveur, il dépend
  de `defaultLabels`).

`tsconfig` : hérite de `@zero/tsconfig/base` + `noUncheckedIndexedAccess: true` (plus strict
que les apps, RULING #25). `tsc @zero/types = 0`.

Côté serveur, les fichiers d'origine font un **ré-export arrière** (`export { … } from '@zero/types'`),
si bien que les ~dizaines d'imports serveur depuis `'../types'` / `'./driver/types'` /
`'./brain.fallback.prompts'` restent inchangés. Contrat public de module **identique**
avant/après (structure.md §2) : mêmes noms, mêmes types ré-exportés ; `tsc @zero/server = 0`.

## Décision 2 — Frontière `AppRouter` / `Auth` : mécanisme choisi = **aucun réalisable dans le périmètre**

L'acceptation exige que le programme `tsc` de mail **cesse de compiler les sources serveur**
(`tsc mail = 0 TOTAL`). Trois mécanismes étaient offerts (déclarations émises / package de
types dédié / frontière tsconfig). **Les trois sont bloqués**, pour deux causes racines
mesurées, toutes deux **hors du périmètre MAY TOUCH** de #25.

### Cause racine A — le résidu 17 n'est PAS « 100 % via AppRouter »

Mesure (worktree neuf, séquence complète), en neutralisant les ponts un par un :

| État | `tsc mail` erreurs `../server/src` |
|---|---|
| baseline | 17 |
| `AppRouter` = `any` (import `@zero/server/trpc` coupé), `Auth` réel | **17** |
| `AppRouter` réel, `Auth` = `any` (import `@zero/server/auth` coupé) | **17** |
| `AppRouter` = `any` **et** `Auth` = `any` | **0** |

⇒ `@zero/server/trpc` (`AppRouter`) **ET** `@zero/server/auth` (`Auth`) tirent **chacun
indépendamment** le même graphe serveur profond. Couper l'un laisse 17 via l'autre. (Le
modèle du spec « les 17 viennent de l'import AppRouter » est donc incomplet.) `AppRouter=any`
n'est pas une option : il induit **395 erreurs** en aval (le client tRPC typé s'effondre en
`{}` — `Property 'settings' does not exist`, etc.).

Les 17 erreurs sont toutes des mismatches d'`Env` global (`Property 'AI'|'VECTORIZE'|
'HYPERDRIVE'|… does not exist on type 'Env'`) dans `thread-workflow-utils/workflow-functions.ts`
(8), `lib/bulk-delete.ts` (4), `routes/agent/mcp.ts` (3), `routes/agent/index.ts` (1),
`routes/agent/db/drizzle/migrations.js` (1) — le `Env` de mail (worker-configuration) n'a
pas les bindings du serveur.

Racine de l'inclusion (`tsc --explainFiles`) : **`apps/server/src/env.ts:1-2`** fait
`import type { … } from './main'` et `import type { … } from './routes/agent'` (classes
Durable Object utilisées pour typer les `DurableObjectNamespace<…>`). `env.ts` est
foundational (importé partout : `auth.ts` en direct, tout le graphe tRPC en transitif) ;
ses `import type` **relatifs** tirent `main.ts` → tout le graphe HTTP/agent/workflow.

### Cause racine B — aucune déclaration `AppRouter`/`Auth` n'est émissible

`tsc --emitDeclarationOnly` (testé avec/sans `isolatedModules`/`verbatimModuleSyntax`,
`noEmitOnError:false`) **échoue** : `TS2742`/`TS4023` sur `serverTrpc` (`trpc/index.ts:48`),
`privateProcedure`/`activeConnectionProcedure`/`activeDriverProcedure` (`trpc/trpc.ts`),
`createAuth` (`lib/auth.ts:160`). Cause : types **non-portables / non-nommables** —
`zod@4.4.3` (v4 bundlée par better-auth, alors que le repo est en zod v3) via `zod/v4/core`,
et `MCPOptions` de `better-auth/dist/plugins/mcp` (sous-chemin interne non exporté). Ces
exports vivent dans les **mêmes fichiers** que `AppRouter`/`Auth` → aucun `.d.ts` produit.
`rollup-plugin-dts` (bundler qui inline) **échoue de la même façon** (il compile le module
source et bute sur `serverTrpc`). `api-extractor` a besoin des `.d.ts` de `tsc` en entrée →
mort aussi.

### Alternatives rejetées (avec preuve)

1. **Déclarations `.d.ts` émises** (option 1 du spec) — rejeté : `TS2742`/`TS4023` (cause B).
   Les fichiers bloquants (`trpc/index.ts`, `trpc/trpc.ts`, `lib/auth.ts`) sont **hors
   MAY TOUCH** ; et même touchés, annoter des types tRPC/better-auth entièrement inférés
   est impraticable.
2. **Bundler de déclarations** (rollup-plugin-dts / api-extractor) — rejeté : même `TS2742`.
3. **Frontière tsconfig `paths`** (option 3) — rejeté : `tsc` ne consulte `paths` que pour
   les specifiers **bare** ; l'arête poison `env.ts → './main'|'./routes/agent'` est
   **relative**, non-interceptable. Rediriger les seuls specifiers bare `@zero/server/*` vers
   des stubs **perd le typage** d'`AppRouter`/`Auth` (les 395 erreurs).
4. **Package de types dédié pour `AppRouter`** (option 2) — rejeté : `AppRouter = typeof appRouter`
   / `Auth = typeof createAuth` sont liés à des valeurs serveur ; on ne peut pas les déplacer.
5. **Fusion d'`Env`** (augmenter le `Env` global de mail) — rejeté : c'est le **sens inverse**
   de « cesser de compiler les sources serveur » (ça les fait compiler), et **incomplet**
   (15/17 seulement ; restent `migrations.js` → `.sql` et `ReadableStream` asyncIterator).

### Conséquence : shim `dormroom` conservé

Le shim `dormroom` de `apps/mail/tsconfig.json` (`paths` → `../server/src/vendor/dormroom.d.ts`)
a été **vérifié toujours vivant** : sans lui, `tsc mail` = 37 (dont 6 erreurs `dormroom`
node_modules), car les sources serveur restent dans le programme mail (frontière non coupée).
Il sera retirable **uniquement** quand la frontière `AppRouter`/`Auth` sera résolue.

## Ruling demandé (handoff orchestrateur)

Le sous-gate `tsc mail = 0 TOTAL` (et donc `typecheck-report BASELINE.mail 17 → 0`) n'est
**pas atteignable dans le périmètre de #25**. Il requiert l'un de :
- **(a)** casser l'arête `apps/server/src/env.ts → './main' / './routes/agent'** (déplacer
  les types de classes DO vers un module feuille), ce qui touche `env.ts` (foundational,
  hors périmètre) et dépend de `main.ts` (#24) / `routes/agent` (#22) ; **ou**
- **(b)** rendre `serverTrpc` / `createAuth` / les procédures émissibles (relocalisation hors
  des fichiers d'export de type, ou résolution du double zod v3/v4 de better-auth) — touche
  `trpc/index.ts`, `trpc/trpc.ts`, `lib/auth.ts` (hors périmètre) ; **ou**
- **(c)** séquencer #25 **après** #22/#24 puis re-mesurer.

`BASELINE.mail` est donc **laissé à 17** (ratchet honnête, aucune régression) plutôt
qu'abaissé à 0 (ce qui rendrait le check rouge). Tout le reste de #25 (package, frontière
des 5 imports relatifs → 0, règle ESLint, borne `FRONTIER_MAX 5 → 0`) est livré et vert.
