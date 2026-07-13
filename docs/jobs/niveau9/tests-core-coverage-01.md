# Job — tests-core-coverage-01 (issue devlab-io/zero#35, V5.2)

## PHASE 0 — Plan & désaccords (MIRROR: ORCHESTRATOR)

Base : gel `5331ac6a`. Compte baseline mesuré : **121** (server 70 / 9 fichiers + mail 51 / 8 fichiers). Objectif : couverture substantielle des 5 zones, ≥120 total, 3 runs verts, lignes ≥50 % sur les cibles.

### Désaccords / frictions relevés (fichiers réels cités) — je continue malgré tout

1. **`@vitest/coverage-v8` absent du lockfile.** Il n'est déclaré ni dans `apps/mail/package.json` ni dans `apps/server/package.json` ; il n'existe que transitivement dans `node_modules/.pnpm/@vitest+coverage-v8@3.2.7_vitest@3.2.7/`. Le check §3 + le tool-guidance exigent `vitest --coverage`, mais la frontière interdit de toucher lockfile/config. **Résolution :** symlink `node_modules/@vitest/coverage-v8` → paquet du store (node_modules est gitignoré ; ni lockfile ni config touchés ; hors diff git). C'est de l'échafaudage de MESURE, pas un changement produit. **Couture manquante à remonter :** pour que la coverage soit reproductible en CI/juge, `@vitest/coverage-v8` doit être ajouté aux devDependencies (changement lockfile/config, HORS de mon périmètre).

2. **`@testing-library/react` absent** → pas de `renderHook` pour `apps/mail/hooks/use-optimistic-actions.ts`. **Résolution :** le hook est testé comme fonction pure en mockant sa surface de hooks (react `useCallback`→passthrough, jotai/react-query/nuqs/use-mail/query-provider/posthog/sonner/thread-actions/paraglide stubés). Les vrais corps du hook + le vrai `optimisticActionsManager` sont exercés, déterministe, sans renderer. Déviation du chemin « renderHook » implicite — signalée.

3. **La couture driver exige de mocker `./utils`.** `GmailTransport` (`apps/server/src/lib/driver/google-transport.ts`) importe transitivement `cloudflare:workers` via `./utils` → `../server-utils` → `dormroom`/`queryable-object` (mesuré : l'import échoue sur `queryable-object/queryable.ts:1 import { DurableObject } from "cloudflare:workers"`). `execute` est bien la couture d'injection, mais CONSTRUIRE la classe impose de neutraliser la chaîne utils. Je mocke `./utils` (test-only). Conséquence : `withErrorHandler`/`withSyncErrorHandler` sont exercés avec un `./utils` mocké — j'assure leur comportement observable (délégation à `deleteActiveConnection` sur fatal, rethrow) et non le `StandardizedError` réel. Caveat de couverture partielle, non bloquant.

4. **`mail.ts` testé via mock de `../trpc`, pas le routeur réel.** Construire un caller tRPC réel tire `trpc.ts` → `cloudflare:workers` + redis + ratelimit + middleware logging. Je mocke `../trpc` avec un builder fluide fidèle (`.input/.output/.query/.mutation`) qui capture les resolvers, puis j'invoque les VRAIS corps de resolver avec un `ctx` fabriqué. Vraie couverture de lignes de `mail.ts` sans le middleware. Trade-off : middleware auth/ratelimit/logging NON couvert (hors de mes 5 cibles — `trpc.ts` n'y est pas). Signalé.

5. **`env-schema` déjà bien couvert.** `apps/server/src/env-schema.test.ts` (5 tests) couvre le boot zod. J'ajoute un fichier NEUF complémentaire prouvant chacune des 9 clés requises individuellement + ignore des optionnelles/bindings, sans éditer l'existant.

6. **Registre clavier (check §4).** Par RULING 3, livré par #32 (`apps/mail/lib/hotkeys/keyboard-parity.test.ts`, déjà en base — 11 tests plein-tableau). NON dupliqué. Référencé comme satisfaisant le check §4.

### Fichiers de tests prévus (tous NEUFS)
- `apps/server/src/lib/driver/__fixtures__/batch-http-fake.ts` (fixture NEUVE) — fakes multipart batch partagés.
- `apps/server/src/lib/driver/google-transport.test.ts` — classe `GmailTransport` (couture `execute` + batch + scope + quotaUser + compteur).
- `apps/server/src/lib/google-scopes.test.ts` — scopes auth (jamais `mail.google.com`).
- `apps/server/src/lib/auth-providers.test.ts` — config providers auth (scope OAuth, activation, throw requis).
- `apps/server/src/env-schema.boot.test.ts` — boot zod, chaque clé requise.
- `apps/server/src/trpc/routes/mail.test.ts` — resolvers tRPC mail (happy + erreurs). Co-localisé côté **server** (et non `apps/mail/`) pour que `../trpc`, `../../env`, `../../lib/server-utils` résolvent comme le module produit `mail.ts`.
- `apps/mail/store/optimistic-updates.test.ts` — atomes jotai (store optimiste).
- `apps/mail/lib/optimistic-actions-manager.test.ts` — manager (état + singleton).
- `apps/mail/hooks/use-optimistic-actions.test.ts` — hook optimiste (logique réelle, sans renderer).

---

## Inventaire des tests ajoutés (fichier → nombre → ce qui est prouvé)

Total ajouté : **+127 tests** (server 70→168 : +98 ; mail 51→80 : +29). Monorepo 121 → **248**.

### Zone 1 — lib/driver (fake client injecté, zéro réseau)
- `apps/server/src/lib/driver/__fixtures__/batch-http-fake.ts` (fixture NEUVE) — fakes multipart `batch` + `instantBackoffDeps`, réutilisables.
- `apps/server/src/lib/driver/google-transport.test.ts` → **20** — la classe `GmailTransport` via la couture `execute` INJECTÉE :
  - `execute` : compteur de round-trips, `fn` reçoit `this.gmail`, retry backoff sur 429→succès (chaque tentative comptée), non-retryable (400) jamais rejoué ;
  - `getScope` (= union minimale, JAMAIS `mail.google.com`), `getQuotaUser` (suffixe NODE_ENV / undefined) ;
  - `logCycleCallCount` (log via `lib/logger`, reset, retour du total) ;
  - `batchThreadsGet`/`batchAttachmentsGet` happy (Map/tableau COMPLET, format + quotaUser dans le path, boundaryId injecté) + **chemins d'erreur batch** (sous-réponse 503/500 exhaustée → `GmailBatchError` nommant la ref ; `assertBatchComplete`) ; clamps `batchSize` [1,100] observés via round-trips ;
  - `withErrorHandler`/`withSyncErrorHandler` (succès pass-through, non-fatal → wrap+rethrow, fatal → `deleteActiveConnection`).

### Zone 2 — trpc/routes/mail.ts (happy + erreurs)
- `apps/server/src/trpc/routes/mail.test.ts` → **43** — vrais corps de resolver invoqués (mock de `../trpc` = builder fluide capturant les resolvers ; env/DB/hono mockés en mémoire) : lectures (suggestRecipients/get/forceSync/aliases/attachments/rawEmail), `listThreads` (branchement DRAFT/q-recherche/inbox-vide→resync-cooldown/SNOOZED→filtre-expirés), 10 mutations d'étiquettes (add/remove exacts), `modifyLabels`/`toggleStar`/`toggleImportant` (agrégation d'état + succès/échec), `deleteAllSpam` (succès/erreur), `send` (immédiat / draftId / date invalide / date passée / undoSend→queued / long-terme→scheduled), `unsend` (ownership refusé / nettoyage KV), `delete`, `snooze`/`unsnooze` (validations + KV), `processEmailContent` (happy + TRPCError), `verifyEmail` (import dynamique + chemin d'erreur).

### Zone 3 — logique optimiste front (reducers/manager/store)
- `apps/mail/store/optimistic-updates.test.ts` → **6** — atomes jotai (vrai `createStore`) : add/remove, sélecteurs dérivés (`isThreadAffectedByOptimisticAction` avec/sans filtre de type, `getThreadOptimisticActions`), format+unicité de `generateOptimisticId`.
- `apps/mail/lib/optimistic-actions-manager.test.ts` → **4** — état initial, registre par type (set/index/delete), multi-types, singleton.
- `apps/mail/hooks/use-optimistic-actions.test.ts` → **19** — le hook testé comme fonction (surface de hooks mockée, VRAI `optimisticActionsManager`) : garde-fous (listes vides / labelId / draftId), markAsRead silent (exécution directe : mutation+posthog+cleanup), chemin d'erreur (`toast.error`+cleanup), toast (auto-close→exécution ; Undo→annulation sans mutation ; message pluralisé), toutes les variantes (markAsUnread/toggleStar/toggleImportant/toggleLabel/move/delete/snooze/unsnooze/deleteDraft avec events posthog corrects), `undoLastAction`.

### Zone 4 — config auth (scopes/cookies — google-scopes.ts, jamais mail.google.com)
- `apps/server/src/lib/google-scopes.test.ts` → **5** — union minimale exacte, JAMAIS `mail.google.com`, aucune portée trop large (readonly/full/settings/metadata), `GOOGLE_OAUTH_SCOPE_STRING` (join espace).
- `apps/server/src/lib/auth-providers.test.ts` → **7** — `authProviders` (scope OAuth = union minimale, offline, prompt consent conditionnel), `isProviderEnabled` (activé / manquant→log / custom), `getSocialProviders` (map id→config / throw si requis non configuré).

### Zone 5 — schéma env (zod boot)
- `apps/server/src/env-schema.boot.test.ts` → **23** — complément du garde existant : forme (9 clés exactes), chaque clé requise garde le boot si absente OU vide (paramétré), clés hors-schéma (bindings + optionnelles) ignorées, message orientant vers `.dev.vars`.

### Check §4 (registre clavier) — NON dupliqué (RULING 3)
Couverture 100 % du registre livrée par #32 : `apps/mail/lib/hotkeys/keyboard-parity.test.ts` (déjà en base, dans les 51 tests mail). Référencé, hors périmètre #35.

## Coutures manquantes documentées

1. **`@vitest/coverage-v8` absent du lockfile.** Non déclaré dans `apps/{mail,server}/package.json` (présent seulement dans `.pnpm`). Coverage non exécutable sans résolution. **Contournement de MESURE** (hors diff git, hors lockfile/config) : symlink `node_modules/@vitest/coverage-v8` → paquet du store. **Proposition** : ajouter `@vitest/coverage-v8@3.2.7` aux devDependencies (racine ou par package) — changement lockfile/config, HORS périmètre.

2. **`apps/mail/paraglide/**` — artefact i18n généré, requis à la résolution.** `hooks/use-optimistic-actions.ts` importe statiquement `@/paraglide/messages` (compilé par le plugin vite paraglide / `react-router typegen`). Il n'existe pas après un `pnpm install` nu, n'est pas gitignoré (oversight repo), et n'est PAS régénéré par la tâche `test` de turbo. Le hook test s'exécute donc uniquement si paraglide a été généré — ce que produit l'étape de setup MANDATÉE par le tool-guidance (`pnpm --filter @zero/mail exec react-router typegen`, vérifié : elle logge « [paraglide-js] Compilation complete »). Le `vi.mock('@/paraglide/messages')` du test rend le CONTENU de paraglide non pertinent — seule la RÉSOLUTION du chemin compte. **Proposition précise** : (a) ajouter `apps/mail/paraglide/` à `.gitignore` (comme `.react-router`) ; (b) rendre le hook test reproductible sous `pnpm test` nu via SOIT un alias `apps/mail/vitest.config.ts` `@/paraglide/messages`→stub, SOIT un `dependsOn: ["paraglide#compile"]` sur la tâche `test` de `turbo.json`. Les deux sont config, HORS périmètre — non modifiés.

3. **Quirk produit relevé — RÉSOLU par #34 (voir delta ci-dessous).** Le refresh du chemin succès d'une action unique était mort (`typeActions.size===1` évalué après vidage). #34 a livré `lib/optimistic-recovery.ts::isLastPendingOfType` (capture de la taille AVANT suppression) qui restaure ce refresh. Mon test reflète désormais le comportement corrigé. Concern clos.

**Aucun code produit modifié** : `git diff --stat` (fichiers suivis) est VIDE. La couture driver (`./utils` mocké) et la couture mail (`../trpc` mocké) sont des mocks test-only, pas des modifications produit.

## Coverage (verbatim — `vitest --coverage --coverage.provider=v8`)

### Reproduction EXACTE (juge froid — échafaudage de mesure accepté, ruling PHASE 0)

Prérequis (depuis la racine du worktree) : `pnpm install --frozen-lockfile --ignore-scripts` puis générer les types (dont paraglide, requis à la résolution du hook test) :
```
pnpm --filter @zero/server run types
pnpm --filter @zero/mail run types
pnpm --filter @zero/mail exec react-router typegen   # génère aussi apps/mail/paraglide/**
```
Symlink du provider coverage (node_modules gitignoré — ni lockfile ni config touchés ; fix durable = #37) :
```
mkdir -p node_modules/@vitest
ln -sfn "$(pwd)/node_modules/.pnpm/@vitest+coverage-v8@3.2.7_vitest@3.2.7/node_modules/@vitest/coverage-v8" \
        node_modules/@vitest/coverage-v8
```
Mesure server (cibles) :
```
cd apps/server && pnpm exec vitest run --coverage --coverage.provider=v8 \
  --coverage.include='src/lib/driver/google-transport.ts' \
  --coverage.include='src/lib/driver/gmail-batch.ts' \
  --coverage.include='src/lib/driver/gmail-backoff.ts' \
  --coverage.include='src/trpc/routes/mail.ts' \
  --coverage.include='src/lib/google-scopes.ts' \
  --coverage.include='src/lib/auth-providers.ts' \
  --coverage.include='src/env-schema.ts' \
  --coverage.reporter=text
```
Mesure mail (cibles) :
```
cd apps/mail && pnpm exec vitest run --coverage --coverage.provider=v8 \
  --coverage.include='store/optimistic-updates.ts' \
  --coverage.include='lib/optimistic-actions-manager.ts' \
  --coverage.include='hooks/use-optimistic-actions.ts' \
  --coverage.reporter=text
```

Server (cibles) :
```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered
 src/env-schema.ts        100  |   100   |   100   |   100   |
 src/lib/google-scopes.ts 100  |   100   |   100   |   100   |
 src/lib/auth-providers   94.33|  93.33  |   100   |  94.33  | 104-106
 src/lib/driver/gmail-backoff  95.91 | 81.13 | 85.71 | 95.91 | 73-74,150-151
 src/lib/driver/gmail-batch    96.71 | 87.03 |  100  | 96.71 | 64-65,108-109,241
 src/lib/driver/google-transport 90.5 | 83.33 | 83.33 | 90.5 | 143-168
 src/trpc/routes/mail.ts   94.86|  87.28  |   100   |  94.86 |
```
Mail (cibles) — **post-#34** (état gelé fd4056d1) :
```
File                              | % Lines | % Branch | % Funcs
 store/optimistic-updates.ts        100    |   100    |   100
 lib/optimistic-actions-manager.ts  100    |   100    |   100
 hooks/use-optimistic-actions.ts    89.45  |   71     |  64.15
 (All zone optimiste)               90.25  |  74.56   |  66.66
```
Toutes les cibles du check §3 sont **≥ 50 % lignes** (min mesuré : 89,45 % sur le hook). Palier A3 8,5 satisfait avec marge. (Pré-#34 : hook 88,05 % ; la refonte du catch + le fix du refresh l'ont légèrement augmenté.)

## Delta — séquence gelée (rebase sur #34, HEAD fd4056d1)

Après merge de #34 et rebase de ma branche, `pnpm --filter @zero/mail exec vitest run` a signalé **1 failed | 112 passed** : mon test du chemin d'erreur décrivait l'ANCIEN comportement (honoré RULING 1 pré-#34). #34 a refondu `use-optimistic-actions.ts`. J'ai mis à jour **UNIQUEMENT 2 tests devenus mensongers** dans `hooks/use-optimistic-actions.test.ts` (aucun autre fichier, aucun code produit). #34 a livré son test frère `apps/mail/lib/optimistic-recovery.test.ts` (fonctions pures `buildOptimisticFailureToast`/`isLastPendingOfType`) — je NE le duplique PAS : mes tests couvrent l'INTÉGRATION dans le hook.

| Test | Ancien comportement (pré-#34) | Nouveau comportement (post-#34, testé) |
|---|---|---|
| `markAsRead silent … nettoie` | refresh du chemin succès mort (`size===1` évalué après delete) → je n'assertais PAS refetch/remove | `isLastPendingOfType(size AVANT delete)` → l'action unique EST la dernière → `refetchQueries` + `removeOptimisticAction('opt-1')` s'exécutent : je les asserte |
| `chemin d'erreur` (le rouge) | `toast.error('Action failed')` nu + `removeOptimisticAction` direct | `undo()` (retire l'optimiste + vide bg-queue), `reconcileFailedAction` (`invalidateQueries` sur listThreads), `toast.error(message, { action: Retry, duration })` via `buildOptimisticFailureToast` ; j'asserte aussi que le clic Retry ré-applique l'intention (nouvelle action READ) |

Tests non tautologiques (échouables) : le test d'erreur casserait si `undo`/`reconcile`/l'action Retry disparaissaient ; le test succès casserait si le refresh régressait à nouveau.

## 3× `pnpm test` (RC natifs — état FINAL post-#34)

```
RC_1=0   mail 113 passed | server 188 passed | Tasks: 2 successful, 2 total
RC_2=0   mail 113 passed | server 188 passed | Tasks: 2 successful, 2 total
RC_3=0   mail 113 passed | server 188 passed | Tasks: 2 successful, 2 total
```
Total monorepo par run : **301** (compte stable ×3 ; hausse vs 248 = tests des autres jobs V5 mergés au rebase). Déterministe. ≥120 requis : OK.
tsc `--noEmit` : **0 erreur** sur `@zero/server` ET `@zero/mail` (séquence types complète rejouée : server types, mail types, react-router typegen ; baseline 0/0 préservée).

## MIRROR: ORCHESTRATOR

- **Couture driver = `./utils` à neutraliser** (pas seulement `execute`) : `GmailTransport` tire `cloudflare:workers` via `./utils`→`server-utils`→`dormroom`. Point d'injection réel = `execute` (fake `fn`) + `batchHttp` injecté ; `./utils` mocké test-only. Non anticipé par la spec ; signalé.
- **`mail.ts` couvert via mock `../trpc`** (pas le routeur réel) : le middleware auth/ratelimit/logging (dans `trpc.ts`, hors mes 5 cibles) N'EST PAS couvert par ces tests. Trade-off assumé.
- **Hook front couvert sans renderer** (`@testing-library/react` absent) : mock de la surface de hooks. Déviation du chemin `renderHook` implicite.
- **Reproductibilité coverage + hook = dépendante de l'env** (voir coutures 1 & 2) : deux gaps config/lockfile hors périmètre, documentés avec proposition précise.

## STATUS

**COMPLETE_WITH_CONCERNS** (post-#34, HEAD fd4056d1)

Les 5 zones du check §V5.2 sont couvertes (127 tests ajoutés ; **301** total monorepo ≥120), coverage ≥50 % sur toutes les cibles (min 89,45 % sur le hook post-#34), 3× `pnpm test` verts (RC 0/0/0) déterministes (compte stable ×3), tsc 0/0 (server+mail), **zéro code produit modifié** (`git diff --stat` vide ; seul `hooks/use-optimistic-actions.test.ts` mis à jour pour le comportement post-#34). Delta #34 traité : 2 tests réalignés sur le comportement réel, sans duplication du test frère de #34.
**Concerns restants** (env, hors périmètre) : `apps/mail/paraglide/**` généré non gitignoré, requis à la résolution du hook test — produit par le setup mandaté `react-router typegen`. **Résolus/routés** : concern #1 (`@vitest/coverage-v8` lockfile) routé à #37 par l'orchestrateur ; concern #3 (quirk refresh) corrigé par #34.
