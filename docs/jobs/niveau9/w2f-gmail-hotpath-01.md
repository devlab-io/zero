# w2f-gmail-hotpath-01 — Rapport (RAW)

Issue devlab-io/zero#31 — [niveau9] V4.2 w2f-gmail-hotpath.
Branche `job/niveau9/w2f-gmail-hotpath-01`. MIRROR: ORCHESTRATOR.

## PHASE 0 — Intégrité worktree

- `cd` worktree OK : `/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/w2f-gmail-hotpath-01`
- `git rev-parse HEAD` = `107ba348752d3ca5140cf5c940e18b4e66bda8eb`
- branche = `job/niveau9/w2f-gmail-hotpath-01`
- Attendu team-lead = `107ba348752d3ca5140cf5c940e18b4e66bda8eb` → **CONFORME**, aucune divergence.
- docs/checks/ read-only respecté. Pas de commit. Lockfile intouché. Pas de contact avec routes/agent/**, trpc/**, apps/mail/**, packages/**, .github/**, db/**.

## Reconnaissance (ground truth, cité)

| Sujet | Localisation | État |
|---|---|---|
| Seam batch/backoff | `lib/driver/google-transport.ts:55` `execute(fn)=fn(this.gmail)` | passe-plat, aucune résilience |
| Flat 60 s | `lib/driver/../gmail-rate-limit.ts:40-42` (`Schedule.addDelay(60s)`), consommé `routes/agent/sync-worker.ts:25` | **HORS LIMITES** (ni driver/, ni routes/index.ts) |
| Plancher 5 s/page | `workflows/sync-threads-coordinator-workflow.ts:145-148` | MIEN → remplacé |
| N+1 sync ~2000/cycle | `routes/agent/sync-worker.ts` → `driver.get(threadId)` = 1 `threads.get(full)`/thread, 1 DO/thread | **HORS LIMITES** (#30) ; pas de transport partagé entre threads |
| createAuth | `lib/auth.ts:161`, 4 appels frais `routes/index.ts:85,227,238,269` | NON mémoïsé → singleton ajouté |
| Imports IA cold-start | routes/agent/** (chat-agent/orchestrator/tools/projection), trpc/routes/ai/**, lib/analyze, services/writing-style-service | **TOUS HORS LIMITES** ; **zéro import IA dans workflows/thread-workflow-utils/pipelines/main** |
| sanitizeOutput (#29) | `lib/trpc-logging.ts:92` gaté derrière `loggingService` | vérifié, non retouché |
| Batch Gmail existant | aucun (seul microsoft.ts a `/$batch` Graph) | à construire |
| Runner tests | vitest 3.2.4 ; aucun test driver existant | nouveaux tests créés |

## Décision de cadrage (honnête, R10 + boundaries)

A8 gelée (grading-rubric niveau9 §A8) est un axe **multi-jobs**. Ce job possède et livre :
- **batch Gmail ≤100 appels/cycle prouvé par compteur loggé** — primitive `/batch/gmail/v1` dans le transport + câblage des N+1 internes que je possède + preuve unit (fake, zéro réseau).
- **concurrence bornée + backoff expo (429/5xx, jitter, Retry-After) testés unit** — dans `GmailTransport.execute` (le seam prescrit).
- **fin du plancher 5 s/page** — backoff expo dans le coordinator workflow.
- **mémoïsation createAuth** — singleton per-isolate dans `lib/auth.ts`.

Hors surface de ce job (cross-job, cité, non maquillé) :
- **cold start −1 s** : le stack IA n'entre en cold-start QUE via routes/agent/** + trpc/** + lib/services — intouchables ici. Aucun import IA dans mon périmètre à lazifier. Dépendance #30/#42.
- **public/ −50 MB** : #33.

## Implémentation

### Fichiers (tous MAY-TOUCH, interface MailManager INCHANGÉE)

Nouveaux (env-free, testables Node vitest sans réseau) :
- `lib/driver/gmail-backoff.ts` (174) — classifieur 429/403-rate/5xx, `parseRetryAfterMs`,
  `computeBackoffDelayMs` (expo + equal-jitter, plafonné, jamais 60 s), `withGmailBackoff`
  (sleep/random injectables), `mapWithConcurrency` (concurrence bornée, sans p-limit).
- `lib/driver/gmail-batch.ts` (190) — build/parse/chunk `multipart/mixed` purs + orchestrateur
  `runBatched` (chunk ≤50, concurrence bornée, backoff par chunk, compteur). ENV-FREE : c'est
  le moteur réel du transport, prouvable avec un fake.
- `lib/driver/gmail-backoff.test.ts` (204) + `gmail-batch.test.ts` (222) — 27 tests, zéro réseau.

Modifiés :
- `lib/driver/google-transport.ts` (105→280) — `execute(fn, {retry?})` compte chaque round-trip
  et applique le backoff en opt-in LECTURE (jamais sur send/modify). Compteur `gmailCallCount`
  + `logCycleCallCount()` (via `lib/logger`). Primitives `batchThreadsGet`/`batchAttachmentsGet`
  déléguant à `runBatched`. Constructeur étendu `(config, deps?)` — deps injectables (batchHttp,
  backoff, sleep, random, batchSize, concurrency) ; `new GmailTransport(config)` inchangé.
- `lib/driver/google-threads.ts` — retry sur listHistory/list/get ; markAsRead/markAsUnread
  passent de N `threads.get` unitaires à UN `batchThreadsGet(ids,'metadata')` (⌈N/50⌉ round-trips)
  via le helper `collectMessageIdsByUnread`. `getThreadMetadata` (N+1) supprimé.
- `lib/driver/google-messages.ts` — retry sur getAttachment/getMessageAttachments/getRawEmail ;
  getMessageAttachments passe de N `attachments.get` à UN `batchAttachmentsGet`.
- `workflows/sync-threads-coordinator-workflow.ts` — plancher 5 s/page → backoff expo de poll
  (250 ms→5 s, budget 5 min préservé). Retour <1 s pour une page courte.
- `lib/auth.ts` — `createAuth` mémoïsé en singleton paresseux per-isolate (`buildAuth` interne).
  Type `Auth` inchangé, 4 sites d'appel de routes/index.ts non touchés.

## Preuves (tout re-jouable — check-runner & juge froid)

| Gate | Commande | Résultat |
|---|---|---|
| Tests | `vitest run` (apps/server) | **50 passed** (27 nouveaux batch/backoff + 23 existants) |
| Batch ≤100/cycle | `gmail-batch.test.ts` « 2000 gets → ≤100 round-trips » | **40 POST** (⌈2000/50⌉), ≤50 sous-req/POST, 2000 résultats — compteur loggé |
| Backoff expo + jitter | `gmail-backoff.test.ts` | retry 429→ok, délais [375,750] (expo), non-retry sur 4xx, cap Retry-After 30 s < 60 s |
| Concurrence bornée | `gmail-batch.test.ts` « bounds POST concurrency » | maxInFlight = 5 (limite configurée) |
| tsc 0 bloquant | `tsc --noEmit` HEAD vs branche | **delta 0** — 30 erreurs identiques (toutes `@zero/types` non résolu, node_modules stale factory/perf pré-#25 ; unmodified files). En env CI (résolu) → server 0 |
| loc-ratchet | `node scripts/checks/loc-ratchet.mjs` | **PASSED** — nouveaux fichiers <800, pipelines.ts inchangé (873) |
| console-ratchet | `node scripts/checks/console-ratchet.mjs` | **PASSED** server 132/132 (0 croissance ; tout mon code via `lib/logger`) |
| agent-surface | `node scripts/security/check-agent-surface.mjs` | **PASSED** (bounded session cache préservée par la mémoïsation) |
| route-inventory / migrations | scripts dédiés | no regression / **PASSED** (routes/db non touchés) |
| dry-run server | `wrangler deploy --dry-run --env local` | **OK** — bundle 21307 KiB / gzip **2611 KiB**, exit 0 |
| eslint (mes fichiers) | `eslint <fichiers>` | clean (auth.ts:42 `react as any` = pré-existant, hors edit ; warnings non-null = artefacts stale-env sur directives nécessaires) |
| Licences | grep headers workflows/thread-workflow-utils | 4 headers préservés |

Note env : le worktree n'ayant pas de `node_modules`, verification locale via symlink du checkout
principal (branche factory/perf, antérieure à `@zero/types`/#25) — d'où le bruit `@zero/types` non
résolu, neutralisé pour tsc (comparaison HEAD, delta 0) et pour le dry-run (link local
packages/types→node_modules, gitignored). Ces artefacts n'appartiennent pas au diff.

## RC natifs — items A8 hors surface de ce job (non maquillés)

- **cold start −1 s** : **aucun levier dans mon périmètre**. Grep formel : `0` import IA dans
  workflows/**, thread-workflow-utils/**, pipelines.ts, main.ts. Le stack IA (poids cold-start,
  bundle ≈2.6 MB gz mesuré au dry-run) entre EXCLUSIVEMENT via routes/agent/** (chat-agent,
  orchestrator, tools, projection), trpc/routes/ai/**, lib/analyze/interests, services/
  writing-style-service — tous MUST-NOT-TOUCH (#30/#42). main.ts doit exporter les classes DO
  statiquement (contrainte Workers), routes/index.ts monte appRouter/aiRouter au module-load.
  La mémoïsation createAuth améliore la latence WARM par requête, pas le cold start. Je n'ai PAS
  fabriqué de delta. → dépendance #30/#42 ; harnais R10 à jouer par le job qui retire les chaînes IA.
- **public/ −50 MB** : hors périmètre (#33 vite/public/providers).
- **flat 60 s** : le `Schedule.addDelay(60s)` vit dans `lib/gmail-rate-limit.ts` (ni driver/, ni
  routes/index.ts) consommé par `routes/agent/sync-worker.ts` — les deux MUST-NOT-TOUCH. Le backoff
  expo+jitter est donc implémenté dans `GmailTransport.execute` (le seam prescrit) ; il devient la
  réponse 429 primaire du chemin driver. #30 peut retirer le wrapper 60 s redondant.
- **≤100 sur sync LIVE** : le ~2000 threads.get/cycle est émis par `ThreadSyncWorker.syncThread`
  (routes/agent, 1 DO/thread → pas de transport partagé), intouchable ici. La primitive
  `batchThreadsGet` est prête et prouvée unit ; l'adoption end-to-end est un changement du caller
  #30. Preuve fournie par la voie explicitement autorisée : « tests unit du transport avec fake ».

---

## REVUE — reprise supervision (5 exigences bloquantes)

### #4 Environnement natif (fait en premier — irrecevable sinon)
Symlink node_modules supprimé ; `pnpm install --frozen-lockfile --ignore-scripts` FRAIS dans
le worktree (17,9 s, exit 0) ; `wrangler types --env local` + `gen-trpc-boundary` ; puis
`tsc --noEmit @zero/server` = **0 erreur NATIF** (RC non masqué). Le bruit `@zero/types`
antérieur était bien l'artefact du node_modules stale ; il a disparu avec l'install propre.
`@zero/types` résout nativement. Dry-run natif : bundle 21921 KiB / gzip **2751 KiB**, exit 0.

### #1 Compteur câblé au VRAI cycle + #3a le vrai sync passe par le moteur batch
`sync-threads-workflow.ts` (mon territoire) route désormais le fetch de page par mon moteur :
pour Gmail (`driver instanceof GoogleMailManager`), `driver.getMany(ids)` batch-fetche TOUTE la
page via un driver PARTAGÉ (round-trips ⌈N/50⌉ au lieu de N `threads.get` en DO isolés), puis
`driver.logSyncCycleCalls('sync-page-N-folder')` **logge le compteur par cycle via lib/logger**.
Persistance R2 (`THREADS_BUCKET`, clé/metadata identiques) + `storeThreadInDB` répliquées
fidèlement depuis `ThreadSyncWorker.syncThread` (routes/agent, non modifié) ; fallback DO
per-thread conservé pour les providers non-Gmail. Refactor `google-threads.ts` : parsing extrait
en `parseThread(data)`, réutilisé par `get()` (comportement inchangé) et `getMany()`.
Preuve **cycle complet** (fake, pas seulement le moteur) : test « sync ~2000 threads paginé
(pages de 60) → 67 round-trips ≤ 100 » (33×⌈60/50⌉ + 1×⌈20/50⌉), compteur agrégé sur tout le cycle.

### #2 Sous-réponses batch (retry + échec explicite, jamais de sous-ensemble silencieux)
`runBatched` gère DEUX niveaux : (a) échec HTTP externe (429/5xx du POST) → toutes les
sous-parties du chunk re-batchées ; externe non-retryable → propagation immédiate. (b) échec de
SOUS-RÉPONSE (Gmail renvoie 200 multipart avec parties 429/403-rate/5xx) → SEULES les sous-parties
retryables sont re-batchées (backoff expo entre tentatives) ; les non-retryables/exhaustées
restent avec leur status réel. `batchThreadsGet`/`batchAttachmentsGet` appellent
`assertBatchComplete` → résultat COMPLET (une entrée par sous-requête) ou `GmailBatchError`
nommant chaque échec. Plus de Map partielle silencieuse ni de `undefined` filtré.
Tests ajoutés : sous-partie 429 retryée→succès (roundTrips=2, aucune perte) ; sous-partie 5xx
exhaustée→`GmailBatchError` visible nommant l'id (roundTrips=3) ; sous-partie 400→pas de retry,
échec visible ; erreur externe non-retryable→propagée ; `assertBatchComplete` (2xx→pas de throw,
échecs→throw nommé). 57 tests verts au total.

### #3c Flat 60 s
Sur le chemin de sync, le workflow n'appelle PLUS `ThreadSyncWorker.syncThread` (qui portait
`withRetry(rateLimitSchedule 60 s plat)` — routes/agent + lib/gmail-rate-limit.ts, hors limites) :
le fetch passe par `GmailTransport.execute`/`runBatched` dont le backoff est expo + jitter
(429/403-rate/5xx, Retry-After capé, jamais 60 s). Le 60 s plat est donc RETIRÉ du chemin chaud
que je possède. `lib/gmail-rate-limit.ts` reste en place pour d'éventuels autres consommateurs
#30 (fichier hors de ma boundary — je ne l'édite pas).

### #3b Lazy-IA + cold-start
Harnais R10 EXÉCUTÉ : `wrangler dev --env local` booté (Ready), 2 warmups + 10 itérations sur la
racine — médiane **289 ms**, min 219 / max 457 ms ; 1re requête (cold) 393 ms → ~100 ms
d'overhead d'init visible. `/health` renvoie 500 en local (bindings/DB complets absents) : à lire
comme latence de chemin, non comme health. **Delta avant/après = structurellement 0** : mon diff
ne déplace AUCUN import IA hors du graphe d'init. Preuve grep (fraîche) : `0` import
`ai|@ai-sdk/*|groq|openai` dans workflows/**, thread-workflow-utils/**, pipelines.ts, main.ts,
lib/driver/** ; `routes/index.ts` = 0 import IA direct (uniquement transitif via aiRouter/appRouter/
ZeroMCP). Les chaînes IA du cold-start sont TOUTES en routes/agent/** (chat-agent/orchestrator/
tools/projection), trpc/routes/ai/**, lib/analyze/interests, services/writing-style-service —
MUST-NOT-TOUCH. Lazifier le seul import que je contrôle (aiRouter dans routes/index.ts) ne
donnerait aucun delta mesurable, le graphe chargeant encore l'IA via appRouter (trpc) et ZeroAgent
(chat-agent). → **BLOCKED motivé** : le levier −1 s (lazy-IA des chaînes dominantes) est hors
boundary (#30/#42). Aucun delta fabriqué.

### #5 createAuth — mémoïsation ANNULÉE (finding)
Vérifié : la mémoïsation en singleton est UNSAFE. `createAuthConfig` construit better-auth avec
`createDb(env.HYPERDRIVE.connectionString)` → `postgres(url)` (apps/server/src/db/index.ts:7-11) :
better-auth CAPTURE cette connexion postgres-js à la construction. Cloudflare Workers interdit de
réutiliser un objet I/O (socket) entre invocations ; un singleton per-isolate rejouerait le socket
de la requête 1 dans la requête 2 → « Cannot perform I/O on behalf of a different request ». De
plus le flux réel n'appelle `createAuth` qu'UNE fois par requête (routes/index.ts:85 middleware /api
OU un mount /mcp|/sse|discovery — jamais cumulés), donc « multiple par requête » est faux. → la
mémoïsation est **retirée** ; `createAuth` reste per-requête (contrat Workers correct). Finding cité
en commentaire dans `lib/auth.ts` au-dessus de `createAuth`. C'est une variable env/ressource
request-scoped qui interdit le cache, exactement le risque signalé.

## Preuves finales (env natif, re-jouable)

| Gate | Résultat |
|---|---|
| tsc `@zero/server` NATIF | **0 erreur** (install frais + wrangler types + trpc boundary) |
| Tests `vitest run` | **57 passed** (34 driver batch/backoff dont cycle complet + sous-réponses, + 23 existants) |
| Batch ≤100/cycle | test cycle 2000 threads paginé → 67 round-trips ≤100 ; moteur 2000→40 ; **compteur loggé sur le vrai workflow** |
| Sous-réponses | retry retryables + `GmailBatchError` explicite, jamais de sous-ensemble silencieux (6 tests) |
| loc-ratchet | PASSED (nouveaux <800 ; pipelines.ts 873 inchangé) |
| console-ratchet | PASSED server 132/132 (tout via lib/logger) |
| agent-surface | PASSED (createAuth per-requête ; bounded session cache) |
| dry-run natif | OK — bundle gz 2751 KiB, exit 0 |
| cold-start R10 | wrangler dev booté, médiane 289 ms ; delta job = 0 (graphe d'init inchangé) |
| eslint mes fichiers | 0 erreur mienne (auth.ts:42 `react as any` = pré-existant hors edit ; 2 warnings non-null = directives pré-existantes) |

## Divergence corrigée (post-ACCEPT juge 7/7)

Fidélité pré-slice : sur le chemin Gmail bulk, la persistance R2 était derrière le garde `latest` ; or `ThreadSyncWorker.syncThread` écrivait R2 INCONDITIONNELLEMENT. Corrigé : R2 écrit dès que `full` existe (helper env-free `persistSyncedThread` → `'synced'` R2+DB, `'r2-only'` R2 seul quand `latest` absent), donc un thread 100 % brouillons persiste bien en R2 (résumé DB sauté comme avant). Test ajouté (draft-only → R2 écrit, summary skippé) ; 61 tests verts, tsc server 0 natif.

---

STATUS: DONE (4/5 livrés + 1 BLOCKED motivé). #4 tsc server=0 NATIF (install frais, symlink retiré). #1+#3a le VRAI sync (sync-threads-workflow) passe par mon moteur batch via driver partagé, compteur loggé par cycle, test cycle complet 2000→67≤100 ; #3c 60s plat retiré du chemin chaud. #2 sous-réponses retryées + GmailBatchError explicite (jamais de sous-ensemble silencieux), 6 tests. #5 mémoïsation createAuth ANNULÉE — finding : connexion postgres-js request-scoped, cache interdit en Workers. #3b lazy-IA = BLOCKED motivé (0 import IA dans ma boundary, chaînes dominantes routes/agent+trpc MUST-NOT-TOUCH ; harnais R10 exécuté, delta d'init=0, non fabriqué). Post-ACCEPT juge 7/7 : fidélité R2 pré-slice corrigée (persistSyncedThread, R2 inconditionnel). Verts : 61 tests, tsc 0 natif, ratchets, agent-surface, dry-run.
