# Job — niveau9 / tsc-zero-mail-01 (issue devlab-io/zero#20, V1.1)

Worktree `.architect/wt/niveau9/tsc-zero-mail-01`, branche `job/niveau9/tsc-zero-mail-01`,
HEAD ancré `a9944dcd59483c6838f975887dde40763c1024bd` (vérifié = attendu).

Objectif : `tsc --noEmit` sur `apps/mail` → 0 erreur **côté mail**, sans changement de
comportement ; `any` explicites mail ≤ 25 ; 0 nouveau `@ts-nocheck` ; `@ts-expect-error`
ajoutés visés à 0 ; tests/build/ratchets verts.

---

## PHASE 0 — Plan & désaccords (avant tout code)

### Plan retenu
1. Ancrer le worktree, lire les fichiers gelés (typecheck.md, grading-rubric §A2, testing.md,
   ci.yml, type-ratchet.mjs, typecheck-report.mjs).
2. Séquence reproductible : `pnpm install` → `wrangler types` (mail **et** server) → mesurer.
3. Corriger les erreurs mail **par famille**, types uniquement.
4. Réduire les `any` par vrai typage (helper d'erreur, interfaces, `unknown`+narrowing).
5. Vérifier (tsc/test/build/ratchets) et resserrer les bornes mail.

### Désaccords / réserves relevés (obligation MIRROR — silence = échec)

**D1 — `pnpm --filter @zero/mail exec tsc` ne peut PAS valoir 0 en isolation ; c'est
structurellement couplé à #21 (server).** Fichiers réels :
`apps/mail/providers/query-provider.tsx:10`, `apps/mail/app/root.tsx:15`,
`apps/mail/lib/trpc.server.ts:2` importent `import type { AppRouter } from '@zero/server/trpc'`.
Or `apps/server/package.json` exporte `"./trpc": "./src/trpc/index.ts"` (**source brute**, pas un
`.d.ts` construit) et `packages/tsconfig/base.json` a `skipLibCheck:true` (qui ne saute que les
`.d.ts`, pas les `.ts` source). Conséquence : le type `AppRouter` tire **tout le graphe source du
serveur** (routes tRPC → `thread-workflow-utils`, `routes/agent`, drivers, + packages Durable
Object en node_modules qui livrent du `.ts` brut) dans le programme tsc de mail. C'est le pattern
tRPC end-to-end **voulu** ; le supprimer casserait la sécurité de types. Donc `tsc mail = 0`
exige que le serveur soit lui aussi à 0. Mesuré : sur 72 erreurs résiduelles de mail après mon
travail, **0 appartiennent à `apps/mail`** ; 52 sont dans `../server/src`, 20 dans des packages DO
node_modules — et ces mêmes 20 figurent aussi dans les 82 erreurs du serveur. Les 72 de mail sont
donc un **sous-ensemble strict des 82 du serveur** : quand #21 amène `tsc server` à 0, `tsc mail`
tombe à 0 **par construction**. Ceci est cohérent avec le critère 6 de `typecheck.md`
(« flip CI **après merge de V1.1 ET V1.2** »). Mon livrable = la moitié mail (erreurs propres = 0).

**D2 — La séquence reproductible documentée est incomplète pour mail.** `docs/testing.md` et
`.github/workflows/ci.yml` ne prescrivent que `wrangler types`. Or mail référence deux familles de
**fichiers générés** absents d'un checkout frais : `@/paraglide/*` (i18n inlang, 40 imports) et
`.react-router/types/**/+types/*` (react-router typegen, `rootDirs` dans `apps/mail/tsconfig.json:9`).
Sans génération, ce sont 47 erreurs « module introuvable ». La commande qui les régénère est
`pnpm --filter @zero/mail exec react-router typegen` (elle compile aussi paraglide). Je ne peux pas
corriger la séquence documentée (docs/testing.md et ci.yml sont **hors de mon périmètre MAY TOUCH**,
et docs/checks/ est gelé). **Recommandation orchestrateur** : ajouter `react-router typegen` avant le
typecheck mail dans la séquence (docs/testing.md / un script `typecheck` mail), sinon le check-runner
mesurera 119 au lieu de 72 sur mail.

**D3 — Génération des types serveur = artefact, pas une violation de frontière.** J'ai exécuté
`pnpm --filter @zero/server types` (mandaté par ci.yml/testing.md). Il n'écrit que
`apps/server/worker-configuration.d.ts`, **gitignoré** (vérifié `git check-ignore`), aucune source
serveur modifiée. Non commité (comme tout le reste).

Aucune autre divergence. Frontières respectées : rien touché hors `apps/mail/**` (sauf
package.json/public/vite.config/wrangler.jsonc), `scripts/checks/*` (bornes seules), et ce rapport.

---

## Familles d'erreurs corrigées (baseline 16 erreurs *propres* mail → 0)

> Note : le baseline `typecheck-report` de 135 = 16 erreurs mail réelles + 47 stubs générés
> (paraglide/react-router) + 72 serveur/node_modules via AppRouter. La génération (D2) résorbe les 47 ;
> #21 résorbe les 72 ; **je corrige les 16 réelles.**

| Famille (code TS) | Count | Approche (types uniquement) |
|---|---|---|
| Résolveur zod v4 ↔ `@hookform/resolvers@4.1.2` (TS2345) | 10 | Shim partagé `apps/mail/lib/zod-resolver.ts` : `@hookform/resolvers@4.1.2` précède le support zod v4 (arrivé en v5), sa signature type le schéma en `ZodSchema<T,any,any>` (forme v3) incompatible avec un `ZodObject` zod v4. Wrapper qui forwarde le resolver de la lib inchangé (runtime identique), double-cast interne via `unknown` (types v3/v4 sans chevauchement). 10 sites bascules sur `@/lib/zod-resolver`. |
| Union `PendingAction` incomplète (TS2353) | 1 | `apps/mail/lib/optimistic-actions-manager.ts` : ajout des variantes `SNOOZE`/`UNSNOOZE`/`DELETE_DRAFT` manquantes (bug réel, cf. plus bas). |
| `ToolInvocation.result` non narrowé (TS2339) | 2 | `apps/mail/components/create/ai-chat.tsx` : narrowing `part.toolInvocation?.state === 'result'` (garde la condition de vérité → comportement identique). |
| `startSession` sans `connectionType` (TS2345) | 1 | `apps/mail/providers/voice-provider.tsx` : ajout `connectionType: 'websocket'` (bug réel révélé, cf. plus bas). |
| Retour de hook tRPC/react-query (TS2339/TS2769) | 2 | `use-delete.ts` (`refetch` inexistant sur `useStats` — bug réel) ; `use-email-aliases.ts` (brand `& Disposable` du RPC Durable Object sur le `TData`). |

Total : **16 → 0 erreurs propres apps/mail**. Toutes les corrections sont des changements de types
(+ 3 bugs réels ci-dessous, tous listés avec diff et correction minimale).

---

## Bugs réels révélés par le typage (comportement — listés, diff pointé)

**B1 — `apps/mail/hooks/driver/use-delete.ts` : appel d'une fonction inexistante (crash runtime).**
`useStats()` (backed Durable Object via `useDoState`, `apps/mail/hooks/use-stats.ts`) retourne
`{ data }` — **pas de `refetch`**. Or use-delete faisait :
```diff
-  const { refetch: refetchStats } = useStats();   // refetchStats === undefined
   ...
-  await Promise.all([refetchThreads(), refetchStats()]);   // undefined() → TypeError
+  await refetchThreads();
```
`refetchStats()` levait `TypeError: refetchStats is not a function` dans le `finally` du toast de
suppression. Correction minimale : retirer l'appel (les compteurs DO sont réactifs, aucune requête à
refetch ; import `useStats` retiré, devenu inutilisé). Seul use-delete déstructurait `refetch`
(3 autres appelants lisent `data`).

**B2 — `apps/mail/lib/optimistic-actions-manager.ts` : variantes d'action optimistes manquantes.**
`BasePendingAction.type` listait `SNOOZE`/`UNSNOOZE` mais l'union `PendingAction` n'exposait pas leurs
`params` ; `DELETE_DRAFT` était carrément absent. Le code masquait le trou avec des `params: {…} as any`
(`use-optimistic-actions.ts:489,513`). Diff :
```diff
   type: 'MOVE' | 'STAR' | 'READ' | 'LABEL' | 'IMPORTANT' | 'SNOOZE' | 'UNSNOOZE'
+  | 'DELETE_DRAFT';
   ...
+  | { type: 'SNOOZE'; params: { currentFolder: string; wakeAt: string } }
+  | { type: 'UNSNOOZE'; params: { currentFolder: string } }
+  | { type: 'DELETE_DRAFT'; params: Record<string, never> }
```
Effet : l'erreur `wakeAt` disparaît **et** les 2 `as any` de contournement sont supprimés (runtime
inchangé — les params passés étaient déjà corrects).

**B3 — `apps/mail/providers/voice-provider.tsx` : champ requis manquant (SDK 0.5.1).**
`@elevenlabs/client@0.5.1` `SessionConfig` (chemin `agentId`/`PublicSessionConfig`) **exige**
`connectionType: 'websocket' | 'webrtc'` ; l'appel l'omettait (probable bump SDK via catalog #18).
```diff
   await conversation.startSession({
     agentId: agentId,
+    connectionType: 'websocket',
     onMessage: (message) => {…},
```
Correction minimale : `'websocket'` (le transport historique/original, avant l'ajout de webrtc) —
ne bascule pas vers webrtc, préserve le comportement pré-existant.

**Bug latent NON corrigé (hors périmètre types-only, signalé) :** `mail.listThreads` renvoie une forme
de thread **minimale** `{ id, historyId, $raw }` (révélé par l'inférence tRPC). Les outils
`apps/mail/lib/elevenlabs-tools.ts` (`listEmails`/`searchEmails`) et
`apps/mail/components/context/command-palette-context.tsx` (suggestions e-mail, quick-search) lisent
`.subject/.sender/.from/.to/.snippet` **absents du type** → `undefined` au runtime. Corriger réclame un
fetch (changement de comportement) : hors scope. Ces sites gardent `any` (documentés inline) pour
préserver le comportement exact.

---

## Réduction des `any` (RULING R4 : mail ≤ 25 ; baseline 79 → 23)

Comptage gelé (grading-rubric §A2, dirs `app components lib hooks store`, hors `.d.ts`/tests).

| Fichier | avant → après | Approche |
|---|---|---|
| `lib/elevenlabs-tools.ts` | 29 → 2 | helper `getErrorMessage(error: unknown)` (14 `catch`), interfaces de params typées (9), maps via inférence tRPC. **2 gardés** : maps `listEmails`/`searchEmails` (bug latent listThreads). |
| `app/(routes)/settings/general/page.tsx` | 8 → 0 | 7 render-props typées `ControllerRenderProps<…, '<champ>'>` ; `setLocale(… as Parameters<typeof setLocale>[0])`. |
| `components/create/ai-chat.tsx` | 6 → 0 | `result`/`args` en `unknown` + narrowing réel ; suppression d'un bloc de commentaire mort. |
| `components/context/command-palette-context.tsx` | 4 → 2 | `recipient` + map typés ; **2 gardés** (forEach/filter threads — bug latent listThreads, documentés inline). |
| `app/(full-width)/contributors.tsx` | 3 → 0 | `res.json()` typés (interfaces GitHub). |
| `components/mail/thread-display.tsx` | 3 → 2 | `threadParam?: unknown` ; **2 gardés** (ref impératif icône animée / `ComponentPropsWithRef`). |
| `lib/utils.ts` | 2 → 1 | `catch (error)` + assertion `{ code?; errors? }` ; **1 gardé** (`convertJSONToHTML` JSON tiptap). |
| divers (mailto-handler, recursive-folder, ai-sidebar, select-all-checkbox, render-labels, use-optimistic-actions) | −8 | narrowing/typages ciblés. |

**23 `any` restants — tous justifiés** : idiomes légitimes (`use-debounce` `(...args: any[]) => any` — passer à
`unknown[]` casserait la contravariance des callbacks typés ; `recipient-autosuggest` `Control<any>` —
composant de formulaire générique) ; objet muté dynamiquement (`mailto-handler` `draftData`) ; typage
tiptap dur nécessitant du module augmentation (`extensions.ts` ×8, `utils.convertJSONToHTML`) ;
préservation de bugs latents documentés (elevenlabs ×2, command-palette ×2). `extensions.ts` (8) laissé
intact (inliné de novel@1.0.2 ; typer les commandes tiptap = déclaration merging, hors périmètre).

`@ts-expect-error` : **4** (baseline inchangé, **0 ajouté**). `@ts-nocheck` : le seul de mail
(`queue-view-model.test.ts`) **retiré** (exigence RUN ligne 9 ; le test type-check proprement sans lui).

---

## Sorties verbatim

**RUN ligne 6 — `pnpm --filter @zero/mail exec tsc --noEmit` (tail) :** 72 erreurs, réparties :
```
apps/mail (local)            : 0      ← livrable : erreurs PROPRES mail = 0
../server/src                : 52     ← #21 (surfacées via type AppRouter)
node_modules (packages DO)   : 20     ← idem 20/82 des erreurs server tsc — #21/infra
```
Les 72 sont un sous-ensemble strict des 82 erreurs de `tsc server` ⇒ `tsc mail = 0 ⟺ tsc server = 0`.

**RUN ligne 8 — `any` mail :** `23`  (≤ 25 ✓, baseline 79)

**RUN ligne 9 — `@ts-nocheck` (mail+server) :** `0`

**`pnpm test` (turbo → server + mail vitest) — avant ET après :**
```
Tasks:    2 successful, 2 total     (exit 0)   [before: idem ; after ci-dessus]
@zero/mail:test:  Test Files 1 passed (1) / Tests 2 passed (2)
```

**`pnpm --filter @zero/mail build` (react-router build) :**
```
✓ built in 10.60s     (exit 0)
```

**`node scripts/checks/type-ratchet.mjs` :**
```
type-ratchet: any(mail)=23/23  any(server)=91/91  any(total)=114/114
type-ratchet PASSED (no regression).
```

**`node scripts/checks/typecheck-report.mjs` (report mode) :**
```
  server: 82 errors (baseline 82)
  mail:   72 errors (baseline 119)
typecheck-report OK — no regression above baseline (baseline can be lowered).
```

**Bornes resserrées (bornes uniquement, jamais élargies, serveur intact) :**
- `scripts/checks/type-ratchet.mjs` : `mail 79→23`, `total 170→114` (server reste 91, #21).
- `scripts/checks/typecheck-report.mjs` : `mail 135→119` (mesure apples-to-apples séquence
  wrangler-only = 135 − 16 erreurs mail corrigées ; server reste 82, #21). En arbre complet
  (paraglide/rr générés) mail mesure 72 < 119 → « baseline can be lowered ».

---

## `@ts-expect-error` ajoutés

**Aucun (0).** Les 4 `@ts-expect-error` présents dans `apps/mail` sont pré-existants (baseline).

---

## MIRROR: ORCHESTRATOR

- **Livrable atteint** : erreurs de type **propres à `apps/mail` = 0** (16 → 0, types uniquement) ;
  `any` mail **79 → 23** (≤ 25, RULING R4) ; `@ts-nocheck` mail → 0 ; **0** `@ts-expect-error` ajouté ;
  `pnpm test` vert avant/après ; `build` mail vert ; ratchets verts (bornes mail resserrées).
- **Réserve bloquante pour le flip CI (D1)** : `pnpm --filter @zero/mail exec tsc = 0` **n'est
  atteignable qu'une fois #21 mergé** — les 72 résiduelles sont 100 % externes (52 server/src + 20
  packages DO node_modules, via le type `@zero/server/trpc` AppRouter) et sont un sous-ensemble des 82
  du serveur. Cohérent avec le critère 6 (flip après merge V1.1 **et** V1.2). Le check-runner exécutant
  la ligne 6 **en isolation** verra 72, pas 0 : à évaluer sur l'arbre mergé (ou avec #21 appliqué).
- **Réserve reproductibilité (D2)** : la séquence mail doit inclure `react-router typegen` (compile
  aussi paraglide) avant le typecheck, sinon +47 erreurs de stubs générés. docs/testing.md et ci.yml
  sont hors de mon périmètre — **action orchestrateur** recommandée.
- 3 bugs réels corrigés (B1 crash refetch, B2 union optimiste, B3 connectionType) ; 1 bug latent
  listThreads signalé non corrigé (hors scope types-only).

## STATUS

STATUS: COMPLETE_WITH_CONCERNS
- (D1) `pnpm --filter @zero/mail exec tsc = 0` couplé à #21 : erreurs *propres* mail = 0, mais 72
  résiduelles externes (server/src + packages DO node_modules) via le type AppRouter ne tombent qu'au
  merge de #21 ; RUN ligne 6 à évaluer sur l'arbre mergé, pas en isolation.
- (D2) Séquence reproductible mail à compléter par `react-router typegen` (paraglide + react-router
  types) dans docs/testing.md / ci.yml — hors de mon périmètre d'écriture ; sinon +47 erreurs de stubs.
- Bug latent `mail.listThreads` (forme minimale) signalé, non corrigé (correction = fetch = hors
  périmètre types-only).
