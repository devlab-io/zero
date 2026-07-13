# Job niveau9/server-runtime-guardrails-01 — V3.4 server-runtime-guardrails (issue #29)

MIRROR: ORCHESTRATOR

Worktree: `.architect/wt/niveau9/server-runtime-guardrails-01`
Branche: `job/niveau9/server-runtime-guardrails-01`
HEAD au démarrage: `ce0102157e1ebb94e21ab837d319bebe3d061bc7` (vérifié — intègre vagues 0-2, pas de divergence)

---

## PHASE 0 — Plan & désaccords (cités sur fichiers réels)

### Désaccords / frontières à trancher (flaggés, je continue)

**D1 — `catch {}` vide hors périmètre bloque le RUN whole-server.**
Le RUN gelé (`docs/checks/niveau9/observability.md:8`) compte `catch{}` vide sur **tout**
`apps/server/src` et exige 0. L'unique `catch {}` truly-empty restant est
`apps/server/src/lib/driver/google-threads.ts:181` — zone #42 (RULING R2), dans mon
MUST NOT TOUCH. Mon périmètre a déjà 0 catch truly-empty. Je ne peux pas corriger driver
sans franchir la frontière et risquer une collision avec #42 en vol.
→ Résolution : soit #42 traite driver:181 avant le juge froid (check combiné V3.4+V5.6),
soit waiver explicite pour la correction 1 ligne `} catch {}` → `} catch { /* ignore */ }`.
Demandé au team-lead. Je continue sur mon périmètre.

**D2 — « boot des 2 workers » : apps/server = 1 worker ; le 2e est apps/mail (#41).**
`apps/server/wrangler.jsonc` déclare 1 worker `zero-server` (`main: src/main.ts`, classe
`Entry extends WorkerEntrypoint`) ; les DO (ZeroDB/ZeroAgent/ZeroDriver…) tournent DANS ce
worker. Le 2e worker déployable du repo est apps/mail (frontend), zone #41 MUST NOT TOUCH.
→ Je câble le boot env-zod sur le worker serveur (main.ts) et j'expose `validateEnv()`
importable ; le worker mail est #41/hors périmètre. Flaggé.

**D3 — `.dev.vars.example` est gitignore par `.gitignore:55` (`.dev.vars.*`).**
La convention du repo est `.env.example` (racine, tracké). Le check #1 exige
`.dev.vars.example synchronisé` (donc commité). Le commentaire du `.gitignore:34`
(« env files can opt-in for committing if needed ») sanctionne l'opt-in.
→ J'ajoute une négation `!.dev.vars.example` au `.gitignore` (changement minimal
nécessaire, hors des listes MAY/MUST-NOT mais requis par le livrable) + je crée
`apps/server/.dev.vars.example`. Flaggé.

**D4 — `env.ts` existe déjà (type-only), pas « nouveau ».**
`apps/server/src/env.ts` est un module de types (type `ZeroEnv` + cast depuis
`cloudflare:workers`) sans aucune validation. J'y AJOUTE le schéma zod + `validateEnv()`
(env.ts est dans mon MAY TOUCH). Pas un conflit — note.

**D5 — logging-service n'est pas un logger généraliste (ADR requis).**
`lib/logging-service.ts` est scopé à l'appel tRPC (exige sessionId/userId, exporte à
Datadog). Router ~314 `console.*` généraux dessus est inadapté. → J'introduis
`lib/logger.ts` (logger structuré JSON, no-op-safe, intégré Sentry pour les erreurs),
justifié par **ADR 0004**. logging-service reste la télémétrie tRPC→Datadog.

**D6 — tracing.ts n'est PAS un stub mort ; décision par ADR 0003.**
[Corrigé post-verdict surface de contrôle — aligné ADR 0003/0005 ; la version antérieure
attribuait à tort au SDK @sentry/cloudflare l'activation des spans OTel : le SDK n'est PAS
utilisé (ADR 0005, client enveloppe minimal), et le client enveloppe ne transporte que les
EXCEPTIONS, pas les spans.]
`initTracing()`/`tracer.startSpan()` ont 4 appelants vivants (main.ts queue thread-queue,
routes/index.ts webhook a8n_notify, pipelines.ts workflow_main, workflow-engine.ts
workflow_execution). Les spans passent par la façade `@opentelemetry/api` et restent
**async-inertes (no-op-safe) tant qu'aucun exporter/provider OTel n'est enregistré** —
aucun ne l'est aujourd'hui (`@microlabs/otel-cf-workers` présent en deps mais NON câblé
dans src — vérifié). Le chemin tRPC a, lui, un tracing RÉEL et indépendant via
`trace-context.ts` (câblé dans `trpc-logging.ts` → Datadog). Le client Sentry enveloppe
(ADR 0005) capture les exceptions uniquement — il ne rend aucun span réel.
→ Décision (ADR 0003) : KEEP tracing.ts comme façade OTel documentée, prête à recevoir un
exporter (Sentry SDK ou otel-cf-workers) le jour où l'alignement workers-types le permet ;
suppression du seul export mort `createSpan` (0 appelant) ; pas de changement lockfile,
pas de restructuration de pipelines.ts (#31).

### Inventaire catch-swallow — MON PÉRIMÈTRE (apps/server/src hors routes/agent/** + lib/driver/**)

17 catch-swallow/borderline identifiés (aucun truly-empty `catch{}` — le grep RUN = 0 sur
mon périmètre ; l'unique truly-empty est driver:181, cf. D1) :

| # | Fichier:ligne | Nature du swallow | Traitement |
|---|---|---|---|
| 1 | thread-workflow-utils/workflow-functions.ts:91 | `catch{}` JSON.parse → `return []` | log debug + contexte |
| 2 | lib/email-utils.ts:42 | `catch{}` new URL → `return null` | log debug + contexte |
| 3 | lib/trpc-logging.ts:109 | catch structuredClone → placeholder | HANDLED (substitution volontaire, commentée) — inchangé |
| 4 | lib/email-verification.ts:134 | catch ipv6CidrMatch → `return false` | log debug + contexte |
| 5 | lib/email-verification.ts:151 | catch SPF include → commentaire seul | log debug + contexte |
| 6 | lib/email-verification.ts:164 | catch validateSPF → `return false` | log warn + contexte |
| 7 | lib/email-verification.ts:219 | catch validateDKIM → `return false` | log warn + contexte |
| 8 | lib/email-verification.ts:238 | catch validateDMARC → `return false` | log warn + contexte |
| 9 | lib/email-verification.ts:435 | catch getBIMILogo → `return undefined` | log debug + contexte |
| 10 | lib/email-verification.ts:457 | `.catch(()=>false)` validateSPF | log debug + contexte |
| 11 | lib/email-verification.ts:460 | `.catch(()=>false)` validateDKIM | log debug + contexte |
| 12 | lib/email-verification.ts:463 | `.catch(()=>false)` validateDMARC | log debug + contexte |
| 13 | lib/email-verification.ts:466 | `.catch(()=>false)` validateBIMI | log debug + contexte |
| 14 | lib/factories/google-subscription.factory.ts:348 | `catch{}` verifyToken → `return false` | log debug + contexte |
| 15 | routes/index.ts:209 | `catch{}` new URL(origin) CORS → `return null` | log debug + contexte |
| 16 | services/writing-style-service.ts:354 | `catch{}` JSON.parse → fallback jsonrepair | log debug + contexte |
| 17 | services/writing-style-service.ts:357 | `catch{}` jsonrepair → best-effort | log debug + contexte |

Bonus (combinateur Effect, hors try/catch mais fallback silencieux) :
`lib/server-utils.ts:256` `Effect.catchAll(()=>Effect.succeed(fallback))` — log ajouté.

### Décisions env (requis / optionnel — honnête)

Source de vérité : `env.ts` (type ZeroEnv) + `.env.example` (racine). Les *bindings* wrangler
(DO/KV/Queue/R2/AI/Vectorize/Hyperdrive) ne sont pas dans le schéma zod (objets garantis par
la config wrangler, pas par `.dev.vars`). Le schéma valide les **variables string** (secrets/
config). Split :
- **REQUISES (9)** — le serveur ne fonctionne pas sans : `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `JWT_SECRET`, `COOKIE_DOMAIN`, `VITE_PUBLIC_APP_URL`,
  `VITE_PUBLIC_BACKEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **OPTIONNELLES** — feature-gated (providers IA, Twilio, Datadog, Axiom, Microsoft, GitHub,
  Redis, Composio, Arcade, Autumn, Perplexity, ElevenLabs, Resend, Posthog, Dub, Sentry, OTEL,
  Meet, Voice…). Absence → boot OK, feature désactivée proprement.

### Comptages console (frozen commands) — AVANT

| Zone | console.* | Note |
|---|---|---|
| TOTAL server (baseline check 465) | **440** | 25 déjà retirés par vagues antérieures |
| routes/agent (#42) | 81 | hors périmètre |
| lib/driver (#42) | 45 | hors périmètre |
| **MON PÉRIMÈTRE (hors agent+driver)** | **314** | cible ≤ ~20 |
| ratchet BUDGET.server | 462 | resserrable vers total atteint |

Distribution périmètre (top) : workflow-functions 63, pipelines 46, email-verification 32,
trpc/routes/mail 22, main 22, google-subscription.factory 16, routes/ai 14,
sync-threads-workflow 10, workflow-engine 10, thread-workflow-utils/index 10, routes/index 9,
server-utils 8, sync-threads-coordinator 7, auth 6, bulk-delete 4, + reste ≤3.

---

## PHASE 2 — Build (terminé)

### Livrables (7 points d'acceptation)

1. **Env zod au boot** — `src/env-schema.ts` (schéma zod pur, testable Node) + `bootEnv()`
   dans `env.ts`, appelé au boot de `fetch`/`queue`/`scheduled` (`main.ts`). 9 clés REQUISES,
   le reste OPTIONNEL (cf. décisions env, PHASE 0). Clé manquante/vide → throw immédiat
   nommant la clé. Testé : `src/env-schema.test.ts` (5 tests). `.dev.vars.example` créé
   (71 clés, requis/optionnel séparés) + négation `.gitignore`.
   NOTE D2 : câblé sur le worker serveur ; le 2e worker (apps/mail) est #41.

2. **Logger structuré** — `lib/logger.ts` (ADR 0004). Sweep console→logger du périmètre :
   **314 remplacements / 35 fichiers**, mécanique et behavior-preserving, en-têtes licence
   préservés (workflows/**, thread-workflow-utils/**), pipelines.ts (#31) = console/catch
   seulement. `logging-service.ts` conservé pour la télémétrie tRPC→Datadog.

3. **Catch-swallow** — inventaire PHASE 0 (17) traité à 100 % : chaque catch loggue avec
   contexte non-sensible (domaine/mécanisme/opération) ; fallback best-effort conservé.
   `trpc-logging.ts:109` = substitution placeholder volontaire (handled, inchangé).
   `catch{}` vide périmètre = 0. NOTE D1 : driver:181 (#42) reste, hors périmètre.

4. **Taxonomie** — `lib/errors.ts` : `AppError` + `ErrorCode` (8 codes) → mapping TRPCError
   + réponses Hono normalisées ; erreur inconnue → 500 générique sans fuite. Testé :
   `lib/errors.test.ts` (6 tests, dont non-fuite de secret).

5. **Sentry Worker** — `lib/sentry.ts` (ADR 0005). **Décision majeure** : l'import du SDK
   `@sentry/cloudflare` casse le gate tsc-0 gelé (sa référence `@cloudflare/workers-types`
   shadowe le typage `env` généré par wrangler → 15 erreurs tsc dans des fichiers non
   touchés, reproductible ; ni ré-assertion ambiante ni `paths` ne corrigent). → Client
   Sentry minimal (protocole enveloppe réel, zéro import polluant) : init avec release,
   capture au bord de la requête (`main.ts` try/catch + `ctx.waitUntil`), no-op propre sans
   DSN, transport injectable. Testé : `lib/sentry.test.ts` (5 tests, erreur capturée →
   transport avec release ; DSN absent → no-op ; transport en échec → ne crashe pas).

6. **Tracing** — `lib/tracing.ts` statué (ADR 0003) : façade OTel documentée, no-op-safe ;
   export mort `createSpan` supprimé ; le chemin tRPC a un tracing réel via
   `trace-context.ts`. Pas de stub mort.

7. **Garde db:push** — `apps/server/scripts/db-push-guard.mjs` + `db:push` = guard &&
   drizzle-kit push. Refuse une cible non locale/staging (preuve ci-dessous).

### Comptages console (frozen command) — AVANT → APRÈS

| Zone | Avant | Après |
|---|---|---|
| TOTAL server | 440 | **132** (≤146 V3.4 ✓) |
| Mon périmètre (hors agent/driver, hors logger.ts) | 314 | **0** |
| logger.ts (sinks intentionnels) | 0 | 4 |
| routes/agent (#42, intouché) | 81 | 81 |
| lib/driver (#42, intouché) | 45 | 45 |

Ratchet resserré : `BUDGET.server` 462 → **132** (front laissé à 143, #41). Front mesuré 125.

### Preuves verbatim

```
pnpm --filter @zero/server test         → Test Files 5 passed | Tests 23 passed (16 nouveaux)
tsc server (wrangler types + tsc)       → 0 errors
TYPECHECK_BLOCKING=1 typecheck-report   → server: 0/0 · mail: 17/17 · OK — no regression
console-ratchet                         → console(server)=132/132 console(front)=125/143 · PASSED
check-agent-surface                     → passed: least scopes, bounded session cache, draft-only MCP
migrations-consistency                  → PASSED (drift within documented allowlist)
wrangler deploy --dry-run --env local   → bundle OK · --dry-run: exiting now.
catch{} vide (apps/server/src)          → 1 (lib/driver/google-threads.ts:181, #42 — D1)
catch{} vide (mon périmètre)            → 0

db-push-guard :
  DATABASE_URL=…@prod-db.devlab.io…   → Refused (exit 1)
  DATABASE_URL=…@localhost…           → accepted local host (exit 0)
  DATABASE_URL=…@staging-db…          → accepted staging host (exit 0)
  DATABASE_URL absent                 → Refused (exit 1)
```

### Fichiers hors MAY-TOUCH justifiés
- `.gitignore` (+1 négation `!.dev.vars.example`) : requis pour committer le template (le
  livrable l'exige ; le commentaire du fichier sanctionne l'opt-in).
- `apps/server/scripts/db-push-guard.mjs` (nouveau) : support du guard db:push (MAY-TOUCH
  couvre le script db:push, ce fichier en est l'implémentation).
- `apps/server/src/env-schema.ts` (nouveau) : extraction pure du schéma pour testabilité Node.

### env.ts — découplage graphe profond (addendum #25) : TENTÉ, IMPOSSIBLE proprement

Ruling addendum : découpler `env.ts` de `import type … from './main'` + `'./routes/agent'`
(qui font tirer le graphe serveur profond dans le tsc de mail via `@zero/server/{trpc,auth}`
→ racine des 17 erreurs mail).

Investigation + test empirique (env.ts seul, dans ma boundary) :
- Les bindings DO de `ZeroEnv` sont typés `DurableObjectNamespace<ClasseConcrète & QueryableHandler>`.
  Le code serveur en dépend réellement : `server-utils.ts` appelle `.setName`, `.setupAuth`,
  `.getThread`, `.modifyThreadLabelsInDB`, `.getDatabaseSize`, `.forceReSync`, etc. (5 sites
  `.get()` + `getZeroAgent` consommé partout, dont pipelines.ts #31 et routes/agent/sync.ts #42).
- Piste privilégiée du ruling (dériver de l'ambient `Cloudflare.Env['ZERO_*']`, sans import
  de classes) — **MESURÉ** :

  | | tsc server | tsc mail |
  |---|---|---|
  | avant (imports profonds) | **0** | **17** |
  | après (dérivation Cloudflare.Env) | **76** | **97** |

  Server explose (perte de `& QueryableHandler`/méthodes concrètes → 76 erreurs, dont dans
  #42/#31 intouchables) ET mail empire (l'ambient `Cloudflare.Env` de mail n'a pas ces DO → 97).

- Piste 2 du ruling (stubs structurels locaux / interfaces vides) — **bloquée structurellement** :
  le blocage n'est pas seulement server-utils.ts (éditable), il y a un usage DIRECT des types DO
  concrets DANS des fichiers hors boundary :
  - `routes/agent/sync.ts:99` (#42) : `this.env.THREAD_SYNC_WORKER.get(...).syncThread(connection, …)`
    — pour typechecker, `ZeroEnv.THREAD_SYNC_WORKER` DOIT porter `syncThread` avec la bonne
    signature ; un stub local devrait re-déclarer cette signature (types `connection`/retour =
    types-domaine du concret) → re-tire le graphe, ou casse #42 que je ne touche pas.
  - `pipelines.ts` (#31) : consomme `getZeroAgent(...).stub.<méthodes concrètes>` — même
    contrainte, hors boundary.
  Reconstruire des interfaces locales = re-déclarer toute la surface RPC des DO avec des
  signatures typées-domaine (fragile, dupliqué, et les signatures re-tirent le graphe). Ce n'est
  pas propre dans env.ts seul.

Conclusion : **le découplage n'est pas réalisable proprement dans la boundary env.ts** (bloqué par
l'usage direct des types DO concrets dans #42 `routes/agent/sync.ts:99` et #31 `pipelines.ts`, +
re-fuite des types-domaine via toute reconstruction de stub). La vraie correction est en amont
(#25) : couper la chaîne AppRouter → contexte tRPC → `env: ZeroEnv` → classes DO au niveau de
l'exposition des types (packages/types / exports / contexte tRPC), au-delà de env.ts et croisant
#42/#31. `env.ts` restauré à l'état qui marche (server 0, mail 17). → Issue corrective pour #25.

### En attente
- **D1** : `catch{}` vide restant = driver:181 (#42). RULING reçu : jugé sur mon périmètre
  (= 0) ; résidu 1 consigné et DÛ par #42. Rien à faire de mon côté. ✓

STATUS: COMPLETE_WITH_CONCERNS — 7/7 points d'acceptation livrés et vérifiés (tsc server 0 · 23 tests · console 440→132, périmètre 314→0 · console-ratchet/typecheck-report bloquant/check-agent-surface/migrations-consistency/wrangler dry-run tous verts). Concerns : (1) Sentry via client enveloppe minimal, pas le SDK — le SDK casse le gate tsc-0 (ADR 0005, ruling ACCEPTÉ) ; (2) découplage graphe profond env.ts IMPOSSIBLE proprement dans la boundary — bloqué par l'usage direct des types DO concrets dans #42/#31 → issue corrective #25 ; (3) `catch{}` vide résiduel driver:181 = dette nominale de #42 (mon périmètre = 0, ruling ACCEPTÉ). Non commité.
