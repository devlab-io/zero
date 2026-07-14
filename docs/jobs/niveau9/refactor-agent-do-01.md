# Job niveau9/refactor-agent-do-01 — Issue devlab-io/zero#22 (V2.1 refactor-agent-do)

MIRROR: ORCHESTRATOR

Worktree: `.architect/wt/niveau9/refactor-agent-do-01`
Branche: `job/niveau9/refactor-agent-do-01`
HEAD au démarrage: `437c7c5a86ae7ff41465f399c6d2ba877ef8b702` (vérifié `git rev-parse HEAD`, non divergent).

---

## PHASE 0 — Plan + désaccords (avant tout code)

### Constat de départ (fichiers réels)
- `apps/server/src/routes/agent/index.ts` = 2262 LOC (mesuré `wc -l`), un fichier
  contenant **trois** classes de premier niveau + un bloc erreurs/types Effect :
  - `ShardRegistry` (DO, lignes 318–336, ~19 l) ;
  - `ZeroDriver` (DO `@Migratable`/`@Queryable`, lignes 338–1907, **~1570 l** — le nœud) ;
  - `ZeroAgent` (`AIChatAgent`, lignes 1909–2262, ~354 l) ;
  - 12 classes d'erreur + 3 unions + interfaces résultat/exigences + alias de type
    Effect + constantes `TOPIC_CACHE_TTL`/`TOPIC_CACHE_KEY` (lignes 99–312, ~213 l).
- Consommateurs externes du barrel `./routes/agent` (grep) : **uniquement**
  `apps/server/src/main.ts:28` (valeurs `ShardRegistry, ZeroAgent, ZeroDriver`) et
  `apps/server/src/env.ts:2` (types de ces 3 classes). Les classes d'erreur et les
  types Effect exportés ne sont **importés nulle part ailleurs**.
- Bindings DO `wrangler.jsonc` (3 env) : `ZeroAgent`, `ZeroDriver`, `ShardRegistry`
  présents ; `new_sqlite_classes` idem. Fichier hors périmètre (MUST NOT TOUCH) →
  diff garanti vide.
- Baseline gelée : server tsc = 0 (gate dur `typecheck-report.mjs`), loc-ratchet
  borne `index.ts` à 2274, THRESHOLD 800.

### Plan de découpage (voir carte détaillée plus bas)
`index.ts` devient un **barrel de ré-export pur**. Les 3 classes + le bloc
erreurs/types partent en modules cohésifs. `ZeroDriver` (irréductible en tant que
classe unique) est **dégraissé** : ses gros corps de méthodes privées sont
externalisés en **fonctions libres** regroupées par concern (topics, recipients,
alarmes/outbox, sync, projection), recevant l'instance via une interface interne
typée `ZeroDriverInternal`. La classe conserve ses champs, son constructeur, ses
décorateurs, son schéma SQLite et sa surface de méthodes publiques (contrat RPC)
**inchangés** — chaque méthode publique devient un délégateur mince.

### Désaccords / tensions / décisions à surfacer (silence = échec)

1. **DÉCISION — `index.ts` = barrel exhaustif, pas mince.** Le check #2 (structure.md)
   exige un snapshot d'exports de module **identique**. `index.ts` exporte aujourd'hui
   les 3 classes *plus* 12 erreurs + unions + interfaces + alias + 2 constantes.
   Même si seuls `main.ts`/`env.ts` consomment les 3 classes, je **ré-exporte tout**
   pour garder le snapshot octet-pour-octet. Le « point d'entrée/ré-export » du spec
   est donc un barrel complet.

2. **DÉSACCORD MÉTHODOLOGIQUE ASSUMÉ — externalisation par fonctions libres, pas
   mixins ni élargissement de visibilité.** `ZeroDriver` est **une seule classe** de
   ~1570 l ; TypeScript ne permet pas d'étaler les méthodes d'une classe sur plusieurs
   fichiers. Pour honorer « aucun module > 800 » sans toucher au comportement, je sors
   les corps lourds en fonctions libres `fn(self: ZeroDriverInternal, …)`.
   - `ctx` et `env` sont hérités de `DurableObject` en `protected` : **impossible**
     de les élargir en `public` (erreur TS « member is protected in base »). Je ne
     modifie donc **aucune** visibilité déclarée de la classe ; le pont est un cast
     unique `this as unknown as ZeroDriverInternal` côté classe (interface interne
     décrivant les membres réellement touchés).
   - Alternatives écartées : **mixins** (change l'identité de classe et casse la
     décoration `@Migratable`/`@Queryable`) ; **rendre les champs publics** (impossible
     pour `ctx`/`env` hérités, et élargit la surface pour les champs propres).
   - Conséquence de type : le cast `unknown` désactive la vérification structurelle au
     joint. Mitigation : `ZeroDriverInternal` décrit fidèlement les membres ; tsc = 0
     reste le garde-fou global (mesuré avant/après).

3. **TENSION DE PÉRIMÈTRE — Contrat de projection vs « contenu = #30 ».** Le spec
   demande au module de projection d'« exposer une surface NOMMÉE pour lire les
   métadonnées de threads … sans corps de messages », tandis que OUT OF SCOPE range
   « changer la projection (contenu) » sous #30. RÉSOLUTION : je **relocalise à
   l'identique** les lectures de threads existantes dans `projection.ts` (+ `labels.ts`)
   avec des **exports nommés** (fonctions + types), sans ajouter de nouveau lecteur
   « sans corps ». La frontière de module + la surface nommée SONT le livrable de #22 ;
   #30 étendra ce module. La section « Contrat » ci-dessous nomme précisément les
   exports consommables et **mappe chaque métadonnée à sa colonne source**.

4. **PRÉCISION — `getThreadFromDB` n'est PAS sans-corps aujourd'hui** : il lit le
   bucket R2 `THREADS_BUCKET` pour les corps. C'est le lecteur de *détail*. Les
   métadonnées réellement lues du SQLite du DO sans corps sont : `getAllSubjects()`
   (sujets via `threads.latestSubject`) et les labels/non-lu via `thread_labels`
   (`getThreadLabels`, db/index.ts — hors périmètre). Le Contrat nomme la surface à
   partir de laquelle #30 composera un lecteur sans-corps.

5. **DÉCISION — check-agent-surface.mjs NON modifié.** Mon découpage ne déplace **pas**
   le registre d'outils (`tools.ts`) ni `mcp.ts` (tous deux hors périmètre/intouchés) ;
   le script les lit par chemin en dur, ces chemins restent valides. RULING R5 autorise
   l'adaptation *si* je déplace le registre — ce n'est pas le cas, donc je **décline**
   la modification de chemins. J'exécute néanmoins la **preuve de non-vacuité** (semer
   une violation temporaire → script rouge → retrait) exigée par le TOOL GUIDANCE ;
   sorties au rapport.

6. **PRÉSERVÉ (rulings #21)** : `rawListThreads` reste une méthode publique de
   `ZeroDriver` avec son type de retour sérialisable exact (index.ts:967–980) ;
   `getThreadFromDB` continue de peupler `.latest` (`IGetThreadResponse`) pour que
   `getThread(...).result.latest` en `mcp.ts:363` reste valide. `mcp.ts` intouché.

7. **HORS PÉRIMÈTRE respecté** : les `console.*` de `routes/agent` sont transportés
   **verbatim** (RULING R2 → #42, pas moi) ; la config drizzle isolée `routes/agent/db/`
   (ADR 0001) intouchée ; `@Migratable`/`drizzle(ctx.storage)` préservés.

---

## Carte de découpage (ancien → nouveaux modules)

Tous les nouveaux fichiers sous `apps/server/src/routes/agent/`, en-tête « Zero Email
Inc. » préservé sur chacun (dérivés de `index.ts`).

| Module | Contenu (origine dans index.ts) | LOC visée |
|---|---|---|
| `index.ts` | barrel : ré-exporte tout (3 classes + erreurs + types + constantes) | ~60 |
| `errors.ts` | 12 classes d'erreur + 3 unions + interfaces résultat/exigences + alias Effect + `TOPIC_CACHE_TTL/KEY` (99–312) | ~215 |
| `internal.ts` | interface `ZeroDriverInternal` (le joint) | ~75 |
| `shard-registry.ts` | classe `ShardRegistry` (318–336) | ~30 |
| `chat-agent.ts` | classe `ZeroAgent` (1909–2262) | ~375 |
| `zero-driver.ts` | classe `ZeroDriver` : champs, ctor, `_migrations`, `setupAuth`, passthroughs driver, délégateurs | <500 |
| `topics.ts` | `getUserTopics` (432–650) | ~215 |
| `recipients.ts` | `suggestRecipients` + `parseMalformedSender` (360–399, 1727–1833) | ~155 |
| `outbox.ts` | cluster draft-outbox + alarmes (744–943) | ~215 |
| `sync.ts` | `syncThread`, `syncFolders`, `forceReSync`+drop/createTables, `triggerSyncWorkflow`, `storeThreadInDB` | ~230 |
| `projection.ts` | `queryThreads`, `getThreadsFromDB`, `getThreadFromDB`, `searchThreads`, `inboxRag`, `normalizeFolderName`, `threadKey` | ~360 |
| `labels.ts` | `modifyThreadLabelsByName`, `modifyThreadLabelsInDB` (1558–1630) | ~80 |

Note : `getAllSubjects` (3 l) reste une méthode publique de `ZeroDriver` (appelée par
`topics` via `self.getAllSubjects()`). `parseMalformedSender`, `getThreadKey`,
`queryThreads`, le cluster draft-outbox privé, `dropTables`/`createTables`,
`triggerSyncWorkflow`, `getDraftOutboxConnectionId` (tous **privés** à l'origine)
quittent la classe en fonctions libres — la surface RPC (méthodes publiques) est
intacte.

### LOC réelles mesurées (`wc -l`, arbre après)

| Fichier | LOC | Statut |
|---|---:|---|
| `index.ts` | **25** | barrel (était 2262 ; sorti de la liste >800) |
| `errors.ts` | 235 | ✓ < 400 |
| `internal.ts` | 76 | ✓ |
| `shard-registry.ts` | 39 | ✓ |
| `chat-agent.ts` | 401 | ✓ < 800 (cible 400 dépassée de 1 l — `ZeroAgent` verbatim) |
| `zero-driver.ts` | 496 | ✓ < 800 (coque de classe irréductible : ~35 méthodes RPC) |
| `topics.ts` | 246 | ✓ < 400 |
| `recipients.ts` | 172 | ✓ |
| `outbox.ts` | 240 | ✓ < 400 |
| `sync.ts` | 275 | ✓ < 400 |
| `projection.ts` | 381 | ✓ < 400 |
| `labels.ts` | 99 | ✓ |

Tous < 800 (limite dure). Deux modules mien dépassent la **cible** 400 de peu
(zero-driver 496, chat-agent 401) : la coque `ZeroDriver` (une classe DO unique,
~35 méthodes publiques RPC + champs + ctor + `setupAuth`) et la classe `ZeroAgent`
recopiée verbatim sont irréductibles sans casser le contrat public. (`mcp.ts` 598 et
`tools.ts` 433 sont hors périmètre, inchangés.)

---

## Contrat d'interface (projection — consommé par #30 et #36)

Module : `apps/server/src/routes/agent/projection.ts`. Frontière NOMMÉE de lecture
des threads sur le SQLite du DO (`threads` + `thread_labels`) et le bucket R2 de corps.

**Fonctions exportées (surface consommable) :**
- `getThreadsFromDB(self, params): Promise<IGetThreadsResponse>` — liste d'IDs +
  curseur de pagination, lue de la table `threads` (via `queryThreads`, 5 cas, sur les
  helpers de `./db`). Sans corps.
- `getThreadFromDB(self, id, includeDrafts?): Promise<IGetThreadResponse>` — thread
  complet : **métadonnées** (`latest` {subject/sender/receivedOn}, `labels`, `hasUnread`,
  `totalReplies`, `isLatestDraft`) issues de `threads` + `thread_labels` ; **corps** issus
  du bucket R2 `THREADS_BUCKET` (clé `${name}/${threadId}.json` via `threadKey`).
- `searchThreads(self, params)` — recherche d'IDs hybride AutoRAG/raw.
- `inboxRag(self, query)` — recherche AutoRAG.
- `normalizeFolderName(folderName): string` — alias `bin` → `trash`.

**Types exportés / de contrat (via `../../lib/driver/types`, re-surface stable) :**
- `IGetThreadResponse` = `{ messages, latest, hasUnread, totalReplies, labels, isLatestDraft? }`
  — la forme de projection par thread.
- `IGetThreadsResponse` = `{ threads: { id, historyId }[], nextPageToken }` — la forme liste.

**Mapping métadonnée → colonne source (livrable clé pour #30) :**
| Métadonnée | Source SQLite |
|---|---|
| sujet | `threads.latestSubject` (et `IGetThreadResponse.latest.subject`) |
| expéditeur | `threads.latestSender` (et `latest.sender`) |
| date | `threads.latestReceivedOn` (et `latest.receivedOn`) |
| labels | `thread_labels` via `getThreadLabels(db, id)` (db/index.ts, hors périmètre) |
| non-lu | dérivé : `labelIds.includes('UNREAD')` depuis `thread_labels` |
| snippet | **inexistant** — aucune colonne `snippet` (ruling #30) ; les corps ne viennent que du R2 |

#30 (projection riche) composera un lecteur **sans corps** à partir de `threads`
(latestSubject/latestSender/latestReceivedOn) + `thread_labels`, en réutilisant cette
frontière — SANS le read R2 que fait `getThreadFromDB`. #36 (MCP) consomme la même surface.

**Rulings #21 préservés (vérifiés) :**
- `rawListThreads` (zero-driver.ts) : méthode publique de `ZeroDriver`, type de retour
  sérialisable recopié verbatim (commentaire inclus).
- `getThreadFromDB` peuple `.latest` → `mcp.ts:363` (`loadedThread.latest`, hors périmètre,
  intouché) reste valide.

---

## Snapshots contrat (avant / après)

**Exports du module `routes/agent/index.ts`** (via checker TypeScript, alias résolus) :
`diff before/after` = **VIDE**. 36 exports avant, 36 après, noms identiques.

Snapshot (identique avant/après) :
```
class BroadcastError, ConcurrencyError, DateNormalizationError, DriverUnavailableError,
class FolderSyncError, LabelCreationError, LabelRetrievalError, ShardRegistry, StorageError,
class ThreadDataError, ThreadListError, ThreadSyncError, TopicGenerationError, ZeroAgent, ZeroDriver
const TOPIC_CACHE_KEY, TOPIC_CACHE_TTL
interface CachedTopics, FolderSyncRequirements, FolderSyncResult, ThreadSyncRequirements,
interface ThreadSyncResult, TopicGenerationRequirements, TopicGenerationResult
type FolderSyncEffect, FolderSyncErrors, FolderSyncFailure, FolderSyncSuccess, ThreadSyncEffect,
type ThreadSyncErrors, ThreadSyncFailure, ThreadSyncSuccess, TopicGenerationEffect,
type TopicGenerationErrors, TopicGenerationFailure, TopicGenerationSuccess
--- total exports: 36
```
(Outil : `scratchpad/snapshot-exports.mjs`, hors périmètre committé ; résout les alias de
ré-export pour classer un barrel à l'identique du monolithe.)

**Routes montées / bindings DO** (`wrangler deploy --dry-run --env local`) : les 3 classes
apparaissent bien comme Durable Objects — `ZERO_AGENT (ZeroAgent)`, `ZERO_DRIVER (ZeroDriver)`,
`SHARD_REGISTRY (ShardRegistry)`. `wrangler.jsonc` **intouché** (git diff vide), donc bindings +
`new_sqlite_classes` (schéma SQLite du DO) inchangés par construction. Les migrations
`@Migratable` sont recopiées verbatim (`_migrations` dérivé de `db/drizzle/migrations`,
inchangé ; migration inline de `ShardRegistry` inchangée).

---

## Sorties verbatim (tsc / test / dry-run / loc-ratchet / check-agent-surface)

**tsc server (`pnpm --filter @zero/server exec tsc --noEmit`, après `wrangler types`) :**
```
AVANT : server errors: 0   (rc=0)
APRÈS : server errors: 0   (rc=0)
```

**Tests (`pnpm --filter @zero/server test` = vitest run) :**
```
AVANT : Test Files 2 passed (2) | Tests 7 passed (7)
APRÈS : Test Files 2 passed (2) | Tests 7 passed (7)
```

**wrangler deploy --dry-run --env local :**
```
Total Upload: 21890.32 KiB / gzip: 2745.38 KiB
env.ZERO_AGENT (ZeroAgent)        Durable Object
env.ZERO_DRIVER (ZeroDriver)      Durable Object
env.SHARD_REGISTRY (ShardRegistry) Durable Object
--dry-run: exiting now.
wrangler dry-run rc=0
```

**loc-ratchet (`node scripts/checks/loc-ratchet.mjs`) :**
```
loc-ratchet: files > 800 LOC = 16 (budget entries 17)
loc-ratchet: cross-app frontier imports = 5 (max 5)
loc-ratchet: 1 budget entry prunable (info):
  - apps/server/src/routes/agent/index.ts (now 25 <= 800)   <-- LIVRABLE #22
loc-ratchet FAILED (2):
  - GREW past budget: apps/mail/app/(full-width)/contributors.tsx = 1040 LOC > budget 1032
  - GREW past budget: apps/mail/components/context/command-palette-context.tsx = 1922 LOC > budget 1913
```
Les 2 échecs sont des régressions **apps/mail PRÉEXISTANTES au HEAD vierge** (mesurées à
l'identique dans la baseline « avant » sur l'arbre non modifié), hors périmètre #22
(`apps/mail` = MUST NOT TOUCH). Mon apport passe le ratchet : `index.ts` sort de la liste
>800 (2262 → 25), **aucun** nouveau module agent > 800. Sans ces 2 fichiers mail (traités
par un autre job), loc-ratchet serait vert.

**check-agent-surface (`node scripts/security/check-agent-surface.mjs`) — NON modifié :**
```
APRÈS : Security surface check passed: least scopes, bounded session cache, draft-only MCP. (rc=0)
```
Preuve de non-vacuité (RULING R5 ; violation temporaire semée dans `tools.ts` puis restaurée
via `git checkout`) :
```
1. seed "[Tools.SendEmail]:" dans tools.ts -> rc=1 :
   Security surface check failed (1): - in-app agent still registers Tools.SendEmail]:
2. git checkout -- tools.ts -> git status vide (propre)
3. re-run -> rc=0 : Security surface check passed
```

**Revue d'équivalence comportementale (audit adverse indépendant, source-level) :**
`NO DIVERGENCE FOUND`. Diff de chaque corps extrait vs l'original (HEAD, 2262 l) : seules
transformations mécaniques (`this.`→`self.` hors générateurs ; `this.` conservé dans les 2
`Effect.gen(self,…)` ; extraction en fonctions libres à 1er param `self` ; délégateurs
`internal(this)` ; barrel). Vérifié explicitement : 69 méthodes `ZeroDriver` présentes,
signatures identiques ; `ZeroAgent`/`ShardRegistry` verbatim ; ordre du cluster outbox intact
(dont `failLatestDraftOutboxState(db, item, …)` avec `item`, pas `current`) ; `threadKey` =
`${name}/${threadId}.json` ; `.latest` peuplé dans les deux branches ; `queryThreads` 5 cas ;
barrel = 36 noms exacts, aucune fuite (`DRAFT_OUTBOX_CONNECTION_ID_KEY` non ré-exporté). Aucune
condition inversée, aucun statement supprimé, aucune constante/chaîne modifiée.

**Frontières (git status) :** modifiés/ajoutés = `routes/agent/{index,errors,internal,shard-registry,
chat-agent,zero-driver,topics,recipients,outbox,sync,projection,labels}.ts` + le présent rapport.
`wrangler.jsonc`, `main.ts`, `routes/agent/mcp.ts`, `routes/agent/db/**`, `lib/driver/**`, `trpc/**`,
`apps/mail/**`, `packages/**`, `pnpm-lock.yaml`, `.github/**`, `docs/checks/**`, `scripts/checks/**`
= **intouchés** (vérifié). Header « Zero Email Inc. » présent sur les 12 modules (vérifié).

---

## STATUS

STATUS: COMPLETE_WITH_CONCERNS (loc-ratchet reste rouge sur 2 fichiers apps/mail
préexistants au HEAD et hors périmètre #22 — apps/mail = MUST NOT TOUCH ; mon apport
agent passe le ratchet : index.ts 2262→25 sorti des >800, aucun nouveau module >800.
Cibles 400 dépassées de peu sur zero-driver.ts 496 et chat-agent.ts 401, sous la limite
dure 800 — coque de classe DO / classe ZeroAgent irréductibles sans casser le contrat RPC.)
