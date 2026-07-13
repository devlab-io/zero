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

STATUS: BLOCKED — @zero/types + frontière des 5 imports relatifs (grep 0) + règle ESLint (prouvée) + FRONTIER_MAX 5→0 + server tsc 0 / tests / build / dry-run ×2 / agent-surface : TOUS livrés et verts ; le gate dur `tsc mail = 0 TOTAL` est hors périmètre (17 tirés indépendamment par `@zero/server/trpc` ET `@zero/server/auth` via `env.ts→main.ts/routes-agent` ; émission `.d.ts` impossible TS2742 zod-v4/better-auth) → ruling orchestrateur requis (ADR 0004).
