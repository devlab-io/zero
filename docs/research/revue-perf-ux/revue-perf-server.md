# Revue perf — serveur, sync Gmail & payloads (Zero / apps/server)

*Branche `factory/perf`. Audit LECTURE SEULE, code lu au commit courant. Aucun service prod/staging appelé avec credentials.*
*Complète la baseline `docs/research/perf-baseline.md` (P0 poids client déjà traité). Ici : le parcours authentifié inexploré — cold start serveur, sync Gmail, chemin de lecture, DB, payloads.*

Statuts : **[VÉRIFIÉ]** = lu dans le code · **[PROBABLE]** = déduit du code, non mesuré · **[HYPOTHÈSE]** = à confirmer par mesure.
Repères d'impact : RTT Tahiti→edge 150–200 ms · TTFB chaud ~0,6 s (connexion fraîche) / ~0,18 s (keep-alive) · débit descendant Tahiti 44–340 kB/s · cold start isolate +1,0–1,1 s.

---

## Synthèse — le classement

| # | Constat | Axe | Sév. | Effort | Statut |
|---|---|---|---|---|---|
| F7 | **N+1 lecture** : la liste renvoie des IDs, le client fait 1 `mail.get` (fil complet) + 1 `processEmailContent` **par ligne** | Lecture | **P0** | M/L | VÉRIFIÉ |
| F1 | Entrée worker importe statiquement tout le stack IA + googleapis + better-auth → init isolate à froid | Cold start | **P1** | L | VÉRIFIÉ |
| F3 | Aucune Gmail **batch API** : sync = N × `threads.get` (1 DO éphémère/thread) | Sync | **P1** | L/M | VÉRIFIÉ |
| F4 | Coordinateur de sync **séquentiel** + polling plancher **5 s/page** | Sync | **P1** | M | VÉRIFIÉ |
| F8 | `getZeroAgent` : sélection de shard = ~3 RPC DO **par shard** à chaque appel | Lecture | **P1** | M | VÉRIFIÉ |
| F11 | Images inline en **base64** embarquées dans le JSON R2 + PJ servies en base64 via tRPC | Payload | **P1** | M | VÉRIFIÉ |
| F5 | 500-way parallèle sur Gmail → 429/403, backoff **plat 60 s** ×10 | Sync | P2 | M | VÉRIFIÉ |
| F2 | `createAuth()` (better-auth complet + pool PG) reconstruit **à chaque requête** | Cold/steady | P2 | M | VÉRIFIÉ |
| F9 | Ouverture de fil = **race sur tous les shards** + `getActiveConnection` non mémoïsé | Lecture | P2 | M | VÉRIFIÉ |
| F10 | `sendDoState` (fan-out tous shards) déclenché sur chaque list + chaque mutation de label | Lecture | P2 | M | VÉRIFIÉ |
| F12 | `sanitizeOutput` = `structuredClone` récursif de **toute** réponse tRPC même Datadog OFF | Payload/CPU | P2 | S | VÉRIFIÉ |
| F14 | `postgres()` sans `max`/`prepare`, pool non fermé dans `createAuthConfig` | DB | P2 | S/M | VÉRIFIÉ |
| F16 | Tracing maison (spans) alloués sur **chaque** requête, public compris | Middleware | P2 | S/M | VÉRIFIÉ |
| F6 | `THREAD_SYNC_LOOP=true` (staging) → re-parcours de **toute** la boîte | Sync | P2 | S | VÉRIFIÉ |
| F13 | superjson sur tout l'I/O tRPC (bloat + CPU) | Payload | P3 | S | VÉRIFIÉ |
| F15 | 1ʳᵉ page inbox : `SELECT` sans `LIMIT` puis slice JS | DB | P3 | S | VÉRIFIÉ |

---

## 1. Cold start (+1 s mesuré)

### F1 — L'entrée worker charge tout le stack lourd à froid  · **P1** · effort L · VÉRIFIÉ
`apps/server/src/main.ts:1-53` importe **statiquement**, au module d'entrée :
- `./trpc` (appRouter) → agrège **tous** les routers (`mail`, `chat`, `ai`, `brain`, `notes`…).
- `./routes/agent` (`ZeroAgent`, `ZeroDriver`, `ShardRegistry`) — et `ZeroAgent extends AIChatAgent` (`routes/agent/index.ts:32,72,78,85,89`) tire **tout le stack IA** : `ai` (`streamText`/`generateText`), `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/groq`, `agents/ai-chat-agent`, `ToolOrchestrator`, `authTools`, MCP oauth provider, prompts, drizzle durable-sqlite.
- `./lib/auth` → `better-auth` + plugins (`jwt`, `bearer`, `phoneNumber`/twilio, `mcp`, `dub`), `drizzleAdapter`.
- driver Gmail (`@googleapis/gmail` 12.0.0 + `@googleapis/people`), `cheerio`, `sanitize-html`, `@barkleapp/css-sanitizer`, `resend`, `twilio`, `effect`, `superjson`, `@react-email/*`, `@modelcontextprotocol/sdk`.

Sur Cloudflare Workers, toutes les classes DO exportées **doivent** vivre dans le module d'entrée (`main.ts:1250-1261`) : le bundle serveur est donc unique et lourd. Au cold start, V8 parse le bundle et **exécute le top-level** de tout ce graphe avant la première requête — c'est le **+1,0–1,1 s** mesuré en B1 §2 (init de l'isolate/module, pas Hyperdrive).

**Impact** : chaque isolate froid (éviction non déterministe, cf. B1 : 3 hits sur 4 post-idle paient la pénalité) ajoute ~1 s au premier TTFB. Perçu à chaque reprise après inactivité.
**Reco** : (a) déplacer les dépendances lourdes hors du top-level via `import()` dynamique **dans les handlers** qui en ont besoin (le stack IA n'est utile que dans le DO `ZeroAgent` et les routes `ai`/`chat`, jamais sur le chemin `fetch` d'une lecture) ; (b) mesurer le bundle réel avec `wrangler deploy --dry-run --outdir /tmp/out` puis trier par taille ; (c) confirmer quelle part du +1 s est parse vs exécution top-level. La contrainte « DO dans l'entrée » limite le gain sur le *parse*, mais l'*exécution top-level* (construction de clients, tables de prompts, regex de sanitize) est récupérable.

### F2 — `createAuth()` reconstruit à chaque requête  · **P2** · effort M · VÉRIFIÉ
`main.ts:621` : le middleware global `.use('*')` appelle `createAuth()` **sur chaque requête** (y compris `/health`, `OPTIONS`, public). `createAuth` (`lib/auth.ts:160`) instancie better-auth **complet** (tous les plugins), un client `twilio()` (`services.ts:12`) et — via `createAuthConfig` (`auth.ts:332`) — un **nouveau pool postgres** (`createDb`). `createAuth` est re-appelé dans plusieurs endpoints (`main.ts:762,773,804`).
**Impact** : coût d'allocation + construction par requête en régime chaud, s'ajoute au cold start.
**Reco** : mémoïser l'instance auth par isolate (module-level lazy singleton) ; court-circuiter l'auth sur les chemins publics ; rendre `twilio()` paresseux (seul le plugin phoneNumber l'utilise).

---

## 2. Sync Gmail

**Architecture (VÉRIFIÉ)** : notification Pub/Sub Gmail → `POST /a8n/notify/:providerId` (`main.ts:861`) → `thread_queue` → `WorkflowRunner.runMainWorkflow` (delta via `history.list`). Sync initiale/complète → `SYNC_THREADS_COORDINATOR_WORKFLOW` → N × `SYNC_THREADS_WORKFLOW` (une page chacun). Stockage : IDs + métadonnées dans le SQLite du DO `ZeroDriver` (sharded), corps complet du fil en **R2** (`THREADS_BUCKET`, 1 objet JSON/fil).

### F3 — Aucune Gmail batch API  · **P1** · effort L/M · VÉRIFIÉ
`lib/driver/google.ts` : aucun appel à l'endpoint batch (`/batch/gmail/v1`). La sync d'une page (`workflows/sync-threads-workflow.ts:143-180`) fait, **par thread** : `THREAD_SYNC_WORKER.get(newUniqueId()).syncThread(...)` → un DO **éphémère unique par thread** (`newUniqueId()` ⇒ aucune réutilisation) qui reconstruit `connectionToDriver` (nouveau client googleapis) puis `driver.get(threadId)` = 1 `threads.get` **format:full** + 1 `R2.put` + 1 `storeThreadInDB`.
**Coût sync initiale 2000 threads** [PROBABLE] : ~4 pages × (1 `threads.list` + 500 `threads.get` + 500 R2 + 500 inserts SQLite) ≈ **~2000 appels Gmail unitaires + 2000 DO éphémères**. L'endpoint batch Gmail accepte **100 sous-requêtes/appel** → ~2000 → **~20 appels HTTP**.
**Reco** : batcher les `threads.get` (100/lot) ; réutiliser un DO `ThreadSyncWorker` par connexion plutôt que `newUniqueId()` par thread.

### F4 — Coordinateur séquentiel + polling plancher 5 s/page  · **P1** · effort M · VÉRIFIÉ
`workflows/sync-threads-coordinator-workflow.ts:115-197` : boucle `do/while` **séquentielle** sur les pages ; pour chaque page, crée le workflow puis **`await setTimeout(5000)` avant chaque vérification de statut** (`:147`), jusqu'à 60 tentatives (5 min). Même si une page finit en 2 s, on attend ≥5 s. Gmail `threads.list` plafonne à **500/page** → 2000 threads = ~4 pages → **≥20 s de pur polling** en plus du traitement.
**Reco** : supprimer le `setTimeout` fixe (utiliser `step.sleep`/événement de complétion, ou statut immédiat) ; envisager le traitement des pages en parallèle plutôt que séquentiel.

### F5 — 500-way parallèle → mur de rate-limit, backoff plat 60 s  · **P2** · effort M · VÉRIFIÉ
`sync-threads-workflow.ts:179-180` : `Promise.allSettled` sur **tous** les threads de la page (jusqu'à 500 `threads.get` simultanés). Quota Gmail = 250 unités/utilisateur/s ; `threads.get` = 10 unités → 500 appels = **5000 unités instantanées** ⇒ 429/403 quasi garantis. Le backoff (`lib/gmail-rate-limit.ts:35-37`) est un **délai plat de 60 s** entre tentatives, jusqu'à 10 fois — une page rate-limitée avance par paliers de 60 s.
**Reco** : concurrence bornée (~10–25, `p-retry`/`p-limit` déjà en deps) + backoff **exponentiel avec jitter** au lieu du 60 s plat.

### F6 — `THREAD_SYNC_LOOP=true` en staging  · **P2** · effort S · VÉRIFIÉ
`wrangler.jsonc:363` (staging) + coordinateur `:197` `while (currentPageToken && shouldLoop)` → le coordinateur **repagine toute la boîte** jusqu'à épuisement du `nextPageToken`, pas seulement les N premiers. Couplé au cron horaire (`:238`) et au re-subscribe, re-parcours périodique de grosses boîtes.
**Reco** : plafonner la profondeur de la sync initiale (seules les pages récentes comptent pour le premier affichage) ; `THREAD_SYNC_MAX_COUNT` limite la page, pas le nombre de pages.

**[HYPOTHÈSE] plafond de sous-requêtes** : une étape de workflow faisant 500 RPC DO + 500 `storeThreadInDB` peut approcher les limites Workers (1000 sous-requêtes / 6 connexions simultanées par invocation). À vérifier dans les logs d'observabilité.

---

## 3. Chemin de lecture

### F7 — N+1 lecture : la liste ne renvoie que des IDs, le client hydrate ligne par ligne  · **P0** · effort M/L · VÉRIFIÉ
- Serveur : `mail.listThreads` (`trpc/routes/mail.ts:74`) → `getThreadsFromDB` → `queryThreads` (`routes/agent/index.ts:1520,1403`) renvoie **uniquement** `{ threads: [{ id, historyId }], nextPageToken }` — aucune donnée d'affichage.
- Client : `components/mail/mail-list.tsx:62` appelle `useThread(message.id)` **pour chaque ligne** ; `useThread` (`hooks/use-threads.ts:65-83`) = `trpc.mail.get.queryOptions({ id })`. Et `:121-165` déclenche en plus une **mutation `processEmailContent`** par dernier message.
- `mail.get` → `getThread` → renvoie le **fil complet** (tous les messages, corps, images base64) juste pour afficher sujet/expéditeur/snippet.

**Résultat** : premier affichage d'une inbox de 50 fils ≈ **50 `mail.get` (fils complets, potentiellement plusieurs Mo) + ~50 `processEmailContent`**. `httpBatchLink` (`providers/query-provider.tsx:91`) regroupe les 50 gets en moins de POST, mais le serveur exécute quand même 50× (sélection de shard + fetch R2 + parse) et sérialise 50 fils complets dans une réponse. Sur un lien Tahiti à 44–340 kB/s, c'est le **coût dominant du parcours authentifié** — plusieurs secondes de payload là où seule une liste de métadonnées est nécessaire.

**Le point clé** : les métadonnées d'affichage **existent déjà** dans le SQLite du DO — `latest_subject`, `latest_sender`, `latest_received_on` (`routes/agent/db/schema.ts`, indexés). `queryThreads` les jette pour ne garder que l'`id`.
**Reco (plus haut ROI serveur)** : faire renvoyer par `listThreads` les métadonnées de ligne (sujet, expéditeur, date, labels/`hasUnread`, snippet) directement depuis le SQLite → **1 requête affiche toute la liste, 0 `get` par ligne**. Réserver `mail.get` (fil complet) à l'ouverture réelle d'un fil.

### F8 — `getZeroAgent` : ~3 RPC DO par shard à chaque appel  · **P1** · effort M · VÉRIFIÉ
`lib/server-utils.ts:315-356` : `getZeroAgent` → `getActiveShardId` → `listShards` (1 requête SQL DO registry) puis, **pour chaque shard**, `getShardClient` (`:46-60` = **2 RPC** : `setName` + `setupAuth`) + `getDatabaseSize` (1 RPC) pour choisir le plus petit, puis **de nouveau** `getShardClient` (2 RPC) sur le shard retenu. Soit **~3 RPC/shard + 2**. `getZeroAgent` est appelé par presque toutes les procédures mail (`get`, `modifyLabels`, `toggleStar`, `getMessageAttachments`, `send`…). Le chemin liste par défaut l'évite (agent unique, `server-utils.ts:411`), mais tout le reste le paie.
**Reco** : mémoïser (registre → shard actif) par connexion/isolate ; `setupAuth` ne devrait pas re-round-tripper à chaque acquisition.

### F9 — Ouverture de fil = race sur tous les shards + `getActiveConnection` non mémoïsé  · **P2** · effort M · VÉRIFIÉ
- `mail.get` → `getThread` (`server-utils.ts:261-297`) → `raceShardDataEffect` : **pour chaque shard**, `getShardClient` (setName+setupAuth) puis `shard.stub.getThread` (`routes/agent/index.ts:1644` : SQLite `get` + `R2.get` + `JSON.parse` du fil + `getThreadLabels`). Coût multiplié par le nombre de shards.
- `activeConnectionProcedure` (`trpc/trpc.ts:59`) appelle `getActiveConnection` (`server-utils.ts:546`) = `getZeroDB` (RPC `setMetaData`) + `findUser` (PG via Hyperdrive) + `findUserConnection` (PG). **Aucune mémoïsation par requête** → répété pour chaque `get` du batch.
**Reco** : cache request-scoped de la connexion active ; éviter la race quand le shard du fil est connu (déjà le cas dans `reSyncThread`/`modifyThreadLabelsInDB` via `getThread().shardId`).

### F10 — `sendDoState` fan-out sur chaque list et chaque mutation de label  · **P2** · effort M · VÉRIFIÉ
`server-utils.ts:407` : `void sendDoState(connectionId)` est déclenché (fire-and-forget) à **chaque** `getThreadsFromDB`. `sendDoState` (`:501-539`) sur cache-miss fait `getDatabaseSize` (**fan-out tous shards**) + `getCounts` (**fan-out tous shards**) + `listShards`. Idem à chaque `modifyThreadLabelsInDB` (`:299-313` → `sendDoState`). Les mutations en masse (`markAsRead`, `toggleStar`… `trpc/routes/mail.ts:196-455`) mappent **par thread** sur `modifyThreadLabelsInDB` → N × (getThread race + sendDoState fan-out). `toggleStar`/`toggleImportant` appellent même `getThread` par id **puis** `modifyThreadLabelsInDB` (qui re-`getThread`) → **2N races + N sendDoState** pour N fils.
**Reco** : cache DO-state (déjà présent, `getCachedDoState`) avec invalidation ciblée ; batcher les mutations de labels côté DO (une passe, un seul broadcast) au lieu d'un fan-out par thread.

---

## 4. DB / Hyperdrive

### F14 — `postgres()` sans configuration, pool non fermé dans l'auth  · **P2** · effort S/M · VÉRIFIÉ
`db/index.ts:7-11` : `createDb` = `postgres(url)` **sans options** (`max`, `prepare`, `idle_timeout`). Dans `createAuthConfig` (`lib/auth.ts:332`) `createDb` est invoqué à **chaque** `createAuth()` (donc chaque requête, cf. F2) et le `conn` n'est **jamais** `.end()` (les workflows/`scheduled`/`resetConnection`, eux, ferment). Sur Workers+Hyperdrive, le motif recommandé est un client unique avec gestion explicite des prepared statements.
**Impact** [PROBABLE] : objets pool accumulés par requête ; risque de statements préparés incompatibles selon le chemin Hyperdrive.
**Reco** : instancier un client PG par isolate (singleton) passé à better-auth ; fixer `prepare`/`max` selon les recommandations Hyperdrive ; ne pas recréer le pool par requête.

### F15 — 1ʳᵉ page inbox : SELECT sans LIMIT puis slice JS  · **P3** · effort S · VÉRIFIÉ
`routes/agent/db/index.ts:466-475` : `findThreadsByFolder` (cas inbox sans `pageToken`, chemin le plus chaud) `SELECT ... INNER JOIN thread_labels ... ORDER BY latest_received_on DESC` **sans `LIMIT`**, puis `queryThreads` fait `.slice(0, maxResults)` en JS (`index.ts:1451`). La variante paginée (`:477-506`) fait bien `LIMIT maxResults+1`. SQLite est **local au DO** (indexé `labelId` + `latest_received_on`) donc sous-ms sur quelques milliers de lignes → impact faible, mais croît avec la taille de la boîte.
**Reco** : aligner le cas 1ʳᵉ page sur la variante paginée (LIMIT SQL).

**Schéma PG (`db/schema.ts`)** : indexation globalement correcte (index sur toutes les FK `user_id`, `connection_id`, `expires_at`, uniques `(userId,email)`). Pas de N+1 flagrant côté Postgres — l'essentiel des lectures de fils passe par le SQLite des DO + R2, pas par PG. PG ne porte que user/session/connection/settings/notes/templates/draft_outbox. RAS majeur ici.

---

## 5. Payloads & sérialisation

### F11 — Images inline en base64 dans le JSON R2 ; PJ servies en base64 via tRPC  · **P1** · effort M · VÉRIFIÉ
- `lib/driver/google.ts:430-448` (`get`) : pour chaque image inline, `getAttachment` (appel Gmail supplémentaire) puis remplacement `cid:` → **`data:<mime>;base64,<...>`** injecté dans `decodedBody`. Ce corps est ensuite stocké tel quel en **R2** (`routes/agent/sync-worker.ts:29`, `JSON.stringify(thread)`). Base64 = **+33 %** de taille, et l'objet R2 **comme** chaque réponse `mail.get` transportent les images en dur.
- `driver.getMessageAttachments` (`google.ts:105-148`) → renvoyées en **base64** via tRPC/superjson (`trpc/routes/mail.ts:793`) — **pas de cache R2, pas de CDN, pas de streaming**. Chaque téléchargement de PJ transite entièrement par le worker en base64.
**Impact** : fils avec images = objets R2 gonflés + réponses `mail.get` lourdes (aggravé par F7 : 50 fils complets d'un coup). Sur lien Tahiti, secondes de payload évitables.
**Reco** : stocker les images/PJ en R2 binaire, servir via une route worker **cachée** (ou URL signée) référencée par le HTML ; retirer le base64 du JSON de fil.

### F12 — `sanitizeOutput` clone toute réponse tRPC même Datadog désactivé  · **P2** · effort S · VÉRIFIÉ
`lib/trpc-logging.ts:87-134` : après chaque appel réussi, `callData` est construit **inconditionnellement** avec `output: sanitizeOutput(output)`, et `sanitizeOutput` fait un **`structuredClone` récursif de chaque champ** de la réponse pour tester la sérialisabilité. En staging, `DD_API_KEY`/`DD_APP_KEY` sont vides (`wrangler.jsonc:367-368`) → `loggingService` est `undefined`, le `logCall` est sauté… mais le **clone a déjà eu lieu** et est jeté. Pur CPU sur le chemin chaud, maximal sur gros payloads (listes, fils complets).
**Reco** : placer la construction de `callData`/`sanitizeOutput` **dans** le `if (loggingService)`.

### F13 — superjson sur tout l'I/O tRPC  · **P3** · effort S · VÉRIFIÉ
`trpc/trpc.ts:18` + client `providers/query-provider.tsx:92` : transformer `superjson` global. Surcoût de sérialisation + méta-wrappers vs JSON brut. Systémique mais marginal ; à réserver aux routes qui en ont besoin (Date/Map/Set) si un gain payload est recherché après F7/F11.

---

## 6. R2 & pièces jointes
Couvert par **F11**. Points confirmés : le corps des fils est en R2 (1 objet JSON/fil, clé `${connectionId}/${threadId}.json`, `sync-worker.ts:14`), lu à chaque ouverture (`getThreadFromDB`, `index.ts:1657`). Pas de proxy image caché ni de cache CDN pour inline/PJ — tout repasse par le worker en base64. Le HTML n'est pas sanitizé au stockage ; `get` renvoie un `decodedBody` (tags strippés) et la sanitize d'affichage se fait **côté serveur à la demande** via la mutation `processEmailContent` (`mail.ts:817`, `lib/email-processor.ts` : `sanitize-html` + `cheerio` + `CssSanitizer`) — un aller-retour serveur par message affiché (cf. F7).

## 7. Divers (middlewares, rate-limit, logs)

### F16 — Tracing maison alloué sur chaque requête  · **P2** · effort S/M · VÉRIFIÉ
`main.ts:589-705` : le middleware global crée des spans `TraceContext` (authentication, token_verification, request_processing) sur **chaque** requête, public comprise. `privateProcedure` et `activeConnectionProcedure` (`trpc/trpc.ts:26,60`) font en plus `await import('./trace-context')` + spans par appel ; le middleware de logging aussi. L'instrumentation OTEL officielle est commentée (`main.ts:25,937-955`), mais le `TraceContext` fait-main tourne et alloue quand même.
**Reco** : conditionner le tracing (échantillonnage / flag) ; l'exclure des chemins publics et `/health`.

**Rate limiter tRPC** (`trpc/trpc.ts:143-174`) : **no-op sans Redis** (`REDIS_URL`/`REDIS_TOKEN` absents → `return next()`). Pas de surcoût, mais aucune protection anti-abus active en self-host — noté, hors périmètre perf.

---

## Ce qui reste à mesurer (non concluable en lecture seule)
- Taille réelle du bundle serveur et part parse vs exécution top-level dans le +1 s (`wrangler deploy --dry-run --outdir`).
- Durée réelle d'une sync initiale 2000 threads + nombre effectif de 429 Gmail (logs observabilité).
- Poids réel d'une réponse `listThreads`-batch de 50 `mail.get` (fil moyen + images) sur le lien Tahiti.
- Hyperdrive froid/chaud réel (session authentifiée requise — cf. baseline §2, BLOCKED).

## Ordre d'attaque recommandé (impact/effort)
1. **F7** (P0) — renvoyer les métadonnées de ligne depuis `listThreads` : supprime ~50 `get` + ~50 `processEmailContent` par affichage de liste. Le plus gros gain serveur, données déjà en base.
2. **F12** + **F16** (P2, effort S) — gains CPU immédiats, quasi sans risque.
3. **F3/F4/F5** (sync) — divise les appels Gmail et le temps de sync initiale.
4. **F8/F9/F10** (hops DO) — mémoïsation shard/connexion + cache DO-state.
5. **F1/F2** (cold start) — lazy-import du stack IA + auth singleton.
6. **F11** — sortir les images du base64/JSON vers R2 caché.
