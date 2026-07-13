# w2a-list-projection-01 — Issue devlab-io/zero#30 (V4.1, P0 produit)

MIRROR: ORCHESTRATOR

## PHASE 0 — Plan + désaccords (fichiers réels, avant tout write)

### État posé par les vagues 0-3 (HEAD 107ba348)

- Squelette en place, **projection riche NON implémentée** :
  `apps/server/src/routes/agent/projection.ts` — `getThreadsFromDB` renvoie encore
  `{ id, historyId: null }` par fil. `queryThreads` récupère pourtant des rows complètes
  (`threadSelect` = id/threadId/providerId/latestSender/latestReceivedOn/latestSubject via
  `apps/server/src/routes/agent/db/index.ts`) puis les **écrase**.
- Couture front posée : `apps/mail/hooks/use-mail-list-data.ts` (contrat `MailListData`,
  `MailListItem = ReturnType<typeof useThreads>[1][number]`).
- Double N+1 confirmé côté front : `apps/mail/components/mail/mail-list-thread.tsx:39`
  `useThread(message.id)` → un `trpc.mail.get` PAR row visible (= 20 `mail.get`, 1,8 MB, +
  16 `processEmailContent` baseline M1).

### Contraintes de bornes (décisives)

- `IGetThreadsResponse` + `IGetThreadsResponseSchema` vivent dans
  `apps/server/src/lib/driver/types.ts` → **MUST NOT TOUCH** (`lib/driver/**`).
  Le type de projection riche est donc un **superset** défini dans `@zero/types`.
- `apps/server/src/routes/agent/db/**` → MUST NOT TOUCH. J'enrichis en **consommant** les
  fonctions DB existantes (`findThreadsByFolderWithPagination` a déjà `LIMIT maxResults+1`).
  Batch labels = une requête drizzle `inArray` écrite DANS projection.ts (lecture `self.db`),
  pas une modif de `db/**`.
- `zero-driver.ts` (MUST NOT TOUCH) : le RPC DO sérialise le **runtime** (types TS effacés).
  Le seul strip runtime est le `.output()` Zod de `mail.ts`. Donc : enrichir le runtime dans
  projection.ts + élargir `.output()` + régénérer la frontière suffit ; le type rich reste
  assignable au thin `IGetThreadsResponse` au site d'appel de `zero-driver.getThreadsFromDB`
  → aucune modif de zero-driver/server-utils nécessaire ni faite.

### Plan d'exécution

1. `packages/types/src/driver.ts` — `ThreadListItem` + `ThreadListItemSchema` +
   `ThreadsResponseSchema` (Zod). Champs riches OPTIONNELS (sujet/expéditeur/date/labels/unread)
   pour que les chemins thin (recherche/brouillons/snoozed) valident.
2. `apps/server/src/routes/agent/projection.ts` :
   - `queryThreads` porte `latest_subject` + `latest_sender` ; Case 2 (folder = chemin inbox)
     unifié sur `findThreadsByFolderWithPagination` → **LIMIT SQL 1ʳᵉ page**.
   - `getLabelsForThreads(db, ids)` : batch labels (UNE requête), map par threadId.
   - `getThreadsFromDB` construit les items riches (subject ← latestSubject, sender ←
     latestSender, date ← latestReceivedOn, labels + unread ← thread_labels).
     `getThreadFromDB`/mcp inchangés. `nextPageToken` : heuristique existante préservée.
3. `apps/server/src/trpc/routes/mail.ts` — `.output(ThreadsResponseSchema)` (from `@zero/types`).
4. `apps/mail/hooks/use-threads.ts` — `useThread(id, { enabled? })` pour gater le fetch corps.
5. `apps/mail/components/mail/mail-list-thread.tsx` — la row rend depuis `message` (projection
   synthétisée en `getThreadData`) quand riche → **aucun `mail.get`, aucun `processEmailContent`** ;
   fallback `useThread` (enabled:true) UNIQUEMENT si item thin (recherche). `useOptimisticThreadState(idToUse)`
   PRÉSERVÉ (overlay Jotai, pas un patch de cache).
6. Régénérer `apps/server/src/trpc/app-router.boundary.d.ts` (drift-test vert).
7. Test unitaire projection (données DO factices) : forme + taille gzip ≤120 KiB/50 lignes + absence de corps/base64.

### Désaccords / rulings (au dossier #30, respectés)

- **snippet RETIRÉ** : aucune colonne snippet ; `latest.body` reste vide côté row projeté →
  le bloc snippet ne se rend pas. Conforme.
- **overlay optimiste = Jotai par ligne** : `useOptimisticThreadState` inchangé, par row.
- **jamais de fetch par ligne (D1 #26)** : inbox riche = 0 fetch row ; reshape à la source.
- **checks docs/checks/perf/w2a* NON normatifs** : norme = performance.md niveau8 (data-path).
  Preuve = analyse data-flow documentée + test unitaire reproductible (baseline M1 avant/après).

### Désaccord signalé (jugement demandé si contesté)

Le chemin **recherche** (`q` présent) passe par `agent.rawListThreads` qui renvoie du **thin**
(annoté volontairement thin dans `zero-driver.ts:202` pour cause de sérialisation RPC) et est
hors bornes. Choix : la row **retombe** sur `useThread` (fetch corps) UNIQUEMENT pour les items
thin, préservant la recherche, au lieu de la casser. Le gate d'acceptation vise le chemin
**inbox initial** ; la recherche est un chemin distinct. Décision : préserver > casser.

---

## PHASE 1+ — Exécution & preuves

### Hygiène sandbox

Artefact temporaire `.architect-tmp-install.log` (log d'install à la racine du worktree)
supprimé ; tous les logs temporaires routés sous `.architect/tmp/`. Racine du worktree
vérifiée nette (git status + ls) — aucun artefact hors emplacement autorisé.

### Diff scope (git status --short) — tout dans MAY TOUCH

```
 M apps/mail/components/mail/mail-list-thread.tsx      (row : rend depuis la projection, gate le fetch)
 M apps/mail/hooks/use-threads.ts                      (useThread(id, { enabled? }))
 M apps/server/src/routes/agent/projection.ts          (getThreadsFromDB enrichi + buildThreadProjection + batch labels)
 M apps/server/src/trpc/app-router.boundary.d.ts        (REGÉNÉRÉ uniquement)
 M apps/server/src/trpc/routes/mail.ts                 (.output(ThreadsResponseSchema))
 M packages/types/src/driver.ts                        (ThreadListItem/ThreadsResponse + schémas)
?? apps/server/src/routes/agent/projection.test.ts     (test unit projection, fake data DO)
?? docs/jobs/niveau9/w2a-list-projection-01.md         (ce rapport)
```
NON touchés (vérifiés) : `db/**`, `lib/driver/**`, `zero-driver.ts`, `server-utils.ts`, `mcp.ts`,
`use-mail-list-data.ts` (le seam consomme le type rich automatiquement), `mail-list-draft.tsx`,
`mail-list.tsx`, `command-palette-context.tsx` (résolu à la source par optionnels non-nullables).

### Gates — RC natifs non masqués (cmd > log 2>&1 ; echo RC=$?)

| Gate | Commande | RC | Preuve |
|---|---|---|---|
| tsc server (BLOQUANT) | `pnpm --filter @zero/server exec tsc --noEmit` | 0 | 0 error |
| tsc mail (BLOQUANT) | `pnpm --filter @zero/mail exec tsc --noEmit` | 0 | 0 error |
| tests server | `pnpm --filter @zero/server test` | 0 | 6 files / 29 tests passed |
| tests mail | `pnpm --filter @zero/mail test` | 0 | 3 files / 16 tests passed |
| test unit projection | (inclus ci-dessus) | 0 | 6 tests ; gzip 50 lignes **1273 B** ≤ 122880 B |
| build mail | `pnpm --filter @zero/mail build` | 0 | built in ~10s |
| dry-run server | `wrangler deploy --dry-run --env local` | 0 | bindings résolus |
| dry-run mail | `wrangler deploy --dry-run` | 0 | bindings résolus |
| loc-ratchet (A1) | `node scripts/checks/loc-ratchet.mjs` | 0 | PASSED (mail.ts net −3 lignes) |
| type-ratchet (A2) | `node scripts/checks/type-ratchet.mjs` | 0 | PASSED (0 `any` ajouté) |
| console-ratchet (A5) | `node scripts/checks/console-ratchet.mjs` | 0 | PASSED |
| migrations (A6) | `node scripts/checks/migrations-consistency.mjs` | 0 | PASSED |
| oxlint sécurité | `oxlint@1.9.0 --deny-warnings <7 fichiers>` | 0 | 0 warning / 0 error |
| check-agent-surface | `node scripts/security/check-agent-surface.mjs` | 0 | least scopes / draft-only MCP |
| frontière drift | `gen:trpc-boundary` (idempotent) | 0 | md5 identique avant/après → drift-test vert au commit |

### Gate d'acceptation #30 — preuve par analyse data-flow (méthode documentée)

Preuve « network log » servie par **analyse démontrable du data-flow** (option autorisée) —
wrangler dev + navigateur headless nécessite un compte Gmail + état DO réels, indisponibles
dans le worktree factory. La chaîne est déterministe et lisible dans le code :

1. **1 requête liste** : inbox (`folder=inbox`, sans `q`) → `trpc.mail.listThreads` →
   `getThreadsFromDB` → items riches. Chaque item porte TOUJOURS `unread: boolean`
   (`buildThreadProjection`, projection.ts). `.output(ThreadsResponseSchema)` ne strippe plus
   subject/sender/date/labels/unread.
2. **0 mail.get par ligne** : `mail-list-thread.tsx` → `isProjected = unread !== undefined`
   (vrai pour inbox) → `useThread(message.id, { enabled: false })` → react-query NE tire PAS
   `mail.get`. La row rend depuis `buildProjectedThreadData(message)`.
3. **0 processEmailContent hors fil actif** : `useThread` avec `enabled:false` → `threadQuery.data`
   undefined → `latestMessage` undefined → le prefetch interne `processEmailContent` est gaté
   `enabled: !!latestMessage?.decodedBody` → jamais déclenché. `latest.body=''` (pas de snippet).
4. **≤1 requête corps (fil actif)** : à l'ouverture, `ThreadDisplay` appelle `useThread(threadId)`
   (enabled par défaut) → 1 `mail.get` pour le seul fil actif.

Résultat : **1 liste + ≤1 corps**, aucun `mail.get` par ligne visible, aucun `processEmailContent`
hors fil actif. Overlay optimiste `useOptimisticThreadState(idToUse)` PRÉSERVÉ (Jotai par ligne).

### Baseline M1 (avant/après)

| | Premier rendu inbox (50 lignes) |
|---|---|
| AVANT (M1) | 1 listThreads (947 o, thin) → **20 mail.get ≈ 1,8 MB** + **16 processEmailContent** |
| APRÈS | **1 listThreads (~1,3 KiB gzip riche)** → **0 mail.get par ligne** + **0 processEmailContent** ; ≤1 mail.get au clic |

### LIMIT SQL 1ʳᵉ page

Chemin inbox (Case 2 folder-only) unifié sur `findThreadsByFolderWithPagination`
(`limit(maxResults+1)`), au lieu de `findThreadsByFolder` fetch-all-then-slice. Les rows du
premier page identiques (même `desc(latestReceivedOn)`), bornées au SQLite.

### Décisions signalées (jugement si contesté)

- **Recherche** (`q`) : `rawListThreads` renvoie du thin (hors bornes, `zero-driver.ts:202`).
  Row → fallback `useThread` (fetch) UNIQUEMENT pour items thin → recherche préservée.
- **Sent** : la row Sent affiche `latestMessage.to` (destinataires), absent de la projection
  `threads`. `isProjected` exclut Sent → fetch préservé, aucune ligne destinataires vide.
  Inbox (cible du gate) reste projeté.

---

## Correctif comparator + cursor (post-jugement, sur HEAD 3358c09b)

Deux findings de supervision (verdict suspendu). Round 1 committé par l'orchestrateur
(`d10f2b39` + checkrun `3358c09b`) ; ce correctif est en uncommitted par-dessus.

### Finding 1 (BLOCKER) — comparateur React.memo incomplet → CORRIGÉ + testé

Régression **introduite** par mon diff : l'ancien comparateur comparait `sender.email` et
`labels.length` SEULEMENT → un refetch remplaçant STARRED par IMPORTANT (longueur égale) ou
changeant `sender.name` à email constant laissait la row obsolète.

Corrigé : comparateur COMPLET sur tous les champs rendus depuis la projection — `sender.name`
+ `sender.email`, labels par **contenu ET ordre** (`sameProjectedLabels`), + subject/receivedOn/
unread/id/index/isKeyboardFocused/onClick. Extrait (avec le view-model) dans un module PUR
co-localisé `mail-list-thread-projection.ts` pour la testabilité : l'env vitest mail ne résout
que les imports `type` (pas d'alias `@/` runtime), donc importer le composant complet dans un
test échoue — le module pur n'a que des imports type-only. La row importe depuis ce module.

Test rouge-avant/vert-après : `mail-list-thread.test.ts` — scénario A (swap STARRED→IMPORTANT
longueur égale → re-render), scénario B (name change même email → re-render), + subject/date/
unread/email/label-order/index/focus, + cas positif identité. **21 tests mail passent (5 nouveaux)**.

### Finding 2 — nextPageToken → classifié DETTE PRÉEXISTANTE + fix partiel sûr

**Classification : dette PRÉEXISTANTE.** Le `getThreadsFromDB` d'origine utilisait déjà
l'heuristique identique (`length===maxResults` + `String(latest_received_on)`) et `queryThreads`
jetait déjà le token paginé. Non introduit par ce diff.

Réparé ce qui est sûr dans mon may-touch :
- **Inbox (Case 2)** consomme désormais le token SQL exact de `findThreadsByFolderWithPagination`
  (`results[maxResults-1]` = last-of-page + `lt` → continuation correcte, plus de page vide fantôme
  au bord exactement plein).
- **Garde null-date** (`heuristicToken`) : ne jamais émettre le curseur bogué `"null"`
  (`String(null)`) qui, comparé par `lt`, matcherait toutes les lignes → boucle/doublons.

NON consommé (à dessein) : le token de `findThreadsWithPagination` (Cases label/complexe) pointe
sur la 1ʳᵉ ligne de la page SUIVANTE, que son propre `lt` exclurait → consommer = **sauter une
ligne**. Cet off-by-one vit dans `db/**` (hors bornes) et préexiste ; le fixer proprement exige
une modif `db/**`. Consigné comme dette datée (2026-07-13, issue #30). Ces chemins gardent donc
l'heuristique (comportement inchangé, + garde null-date).

Tests : `heuristicToken` (page pleine / courte / vide / null-date) + `buildThreadProjection`
passe-token + sentinelle vide. **32 tests serveur passent (heuristicToken inclus).**

### Nouveaux fichiers (round 2)

- `apps/mail/components/mail/mail-list-thread-projection.ts` — module PUR (view-model +
  comparateur), imports type-only. Extraction de MA propre logique de row pour testabilité ;
  importé uniquement par la row et son test.
- `apps/mail/components/mail/mail-list-thread.test.ts` — test du comparateur (tests, MAY TOUCH).

### Re-gates correctif — RC natifs=0

| Gate | RC | Preuve |
|---|---|---|
| tsc server | 0 | 0 error |
| tsc mail | 0 | 0 error |
| tests server | 0 | 6 files / **32** tests ; gzip 50 lignes 1274 B |
| tests mail | 0 | 4 files / **21** tests (5 comparateur) |
| build mail | 0 | built ~9s |
| dry-run server / mail | 0 / 0 | bindings résolus |
| loc / type / console ratchets | 0 | PASSED (projection.ts 449, row 458, module pur 83, mail.ts 870 — tous < 800/budget) |
| frontière tRPC | 0 | md5 inchangé (I/O router identique) → pas de drift |

STATUS: COMPLETE
