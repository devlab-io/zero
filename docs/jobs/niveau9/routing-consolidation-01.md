# Job niveau9/routing-consolidation-01 — V2.3 routing-consolidation (issue #24)

Worktree `job/niveau9/routing-consolidation-01`, HEAD `437c7c5a` (vérifié,
`git rev-parse HEAD` conforme). RAW. MIRROR: ORCHESTRATOR.

---

## PHASE 0 — plan + désaccords (en tête)

### Plan retenu

1. **`routes/chat.ts` (1610 LOC) = code mort → suppression.** Ses classes
   `ZeroAgent`/`ZeroMCP`/`AgentRpcDO` sont des ancêtres périmés des versions
   vives de `routes/agent/**` (#22). Preuve : 0 importeur repo-wide, 0 import
   dynamique, 0 ré-export barrel, 0 test ; l'entry worker (`wrangler main =
   src/main.ts`) lie les 8 DO depuis `routes/agent/**`, jamais depuis chat.ts.
2. **`routes/ai.ts` vs `trpc/routes/ai/*` = collision de namespace, PAS un
   doublon.** Opérations disjointes, auth différente (X-Voice-Secret téléphonie
   vs session). `ai.ts` laissé intact (contrat stable) ; documenté dans l'ADR.
3. **`main.ts` (1242 LOC) → 333 LOC**, deux extractions pures :
   `routes/index.ts` (composition Hono `api`+`app`) et `db/durable-objects.ts`
   (`DbRpcDO`+`ZeroDB`). main.ts ré-exporte les DO → binding `ZERO_DB` et
   `env.ts` intacts.
4. **ADR** posant la frontière + **route-inventory.mjs** (inventaire par couche
   + gate 0 doublon).

### Désaccords / décisions à signaler (MIRROR: ORCHESTRATOR)

- **[D1] Suppression de chat.ts plutôt que réduction en stub.** L'issue dit
  « dédoublonner routes/chat.ts ». Le fichier étant 100 % inatteignable, un stub
  de ré-export serait un couplage neuf inutile (personne ne l'importe). La
  suppression est le seul dédoublonnage cohérent, et strictement
  behaviour-preserving. Gate 3 autorise « supprimé ». Gate 2 (« exports de
  module ») ne s'applique qu'aux contrats **consommés** : les exports de chat.ts
  ne le sont pas (preuve inventaire + grep). Réversible via git.

- **[D2] `db/durable-objects.ts` créé sous `db/`, pas sous `routes/`.** Le
  périmètre autorise « nouveaux modules sous `routes/` ». Le DO base de données
  `ZeroDB`/`DbRpcDO` n'est **pas** une route ; le placer sous `routes/` serait
  sémantiquement faux. Il vit à côté de `db/schema.ts` et `db/index.ts` dont il
  dépend. `db/` n'est PAS dans MUST-NOT-TOUCH et n'est possédé par aucun builder
  parallèle (#22 `routes/agent/**`, #23 `lib/driver/**`). Si l'orchestrateur
  tranche autrement, relocalisation = un `git mv` trivial. Preuve d'innocuité :
  `wrangler.jsonc` diff vide, tsc server 0, dry-run vert.

- **[F1] loc-ratchet ROUGE au HEAD, hors de mon périmètre.** Deux fichiers
  `apps/mail/**` dépassent leur budget **au HEAD `437c7c5a` lui-même**
  (contributors.tsx 1040>1032, command-palette-context.tsx 1922>1913 — LOC
  identiques HEAD vs worktree, `git status apps/mail` vide). Je ne les touche
  pas (MUST NOT TOUCH). Ma contribution loc-ratchet est **verte** : 0 nouveau
  fichier >800, liste d'exceptions rétrécie (chat.ts absent, main.ts 333≤800
  → 2 entrées « prunable info »). Le pruning du budget est le job de #20/#21
  (cf. commentaire loc-ratchet.mjs), pas le mien.

---

## ADR — résumé

`docs/adr/0001-routing-hono-vs-trpc.md`. Frontière : **Hono uniquement pour
streaming/SSE, websockets, webhooks, auth** ; **tRPC pour le reste**. Chaque
route Hono restante est justifiée cas par cas (table dans l'ADR) :
`/sse`,`/mcp`,`/mcp/thinking/sse` (SSE MCP) · `agents/*` (websocket ZeroAgent) ·
`/api/auth/*`,`.well-known/*` (better-auth/OAuth) · `/api/ai/*` (webhook
téléphonie X-Voice-Secret) · `/api/autumn/*` (billing Stripe/Autumn) ·
`/api/public/providers` (bootstrap public) · `/a8n/notify/:providerId`
(Pub/Sub) · `/monitoring/sentry` (tunnel) · `/health`,`/` (infra) · `/api/trpc`
(hôte tRPC). **Aucune route Hono restante ne double une procédure tRPC.**

---

## Inventaire des routes — AVANT / APRÈS (par couche)

Généré par `scripts/checks/route-inventory.mjs` →
`docs/adr/route-inventory-{before,after}.json`.

| Couche | Métrique | AVANT | APRÈS |
|---|---|---|---|
| Hono | routes HTTP | 23 | 23 |
| Hono | montages/sous-routes | 7 | 7 |
| tRPC | namespaces | 17 | 17 |
| tRPC | procédures (query/mutation/subscription) | 80 | 80 |
| — | **functionalDuplicates** | **2** | **0** |
| — | crossLayerNamespaceOverlap | `[ai]` (justifié ADR) | `[ai]` (justifié ADR) |

`functionalDuplicates` AVANT = 2 (`ZeroAgent`, `ZeroMCP` définis à la fois dans
`chat.ts` et `routes/agent/**`) → APRÈS = 0 (chat.ts supprimé).

**Contrat HTTP stable** (diff method+path AVANT↔APRÈS) : 0 route supprimée,
0 ajoutée, namespaces tRPC identiques. Les 23 routes ont seulement migré de
`main.ts` vers `routes/index.ts` (mêmes chemins complets résolus).

---

## Carte de découpage

### `main.ts` : 1242 → 333 LOC

| Bloc source (lignes) | Destination |
|---|---|
| imports | `main.ts` (élagués : ~35 imports → symboles Entry + ré-exports) |
| `DbRpcDO` + `ZeroDB` (58–565) | → `db/durable-objects.ts` (export) |
| `SENTRY_*`, `hashIpAddress`, `const api`, `const app` (55–56, 567–930) | → `routes/index.ts` (export `api`,`app`) |
| `handler` + `export default class Entry` (queue/scheduled/fetch, 931–1229) | `main.ts` (verbatim) |
| ré-exports DO (1231–1242) | `main.ts` — `ZeroDB`/`DbRpcDO` via `export … from './db/durable-objects'` |

Modules résultants : `main.ts` **333**, `routes/index.ts` **393**,
`db/durable-objects.ts` **537** — tous ≤800 ; main.ts ≤400 (cible atteinte).
Couture lazy-import #31 : non prise (hors scope), rendue naturelle par le split.

### `chat.ts` : 1610 → 0 LOC (supprimé, code mort)

Aucun module dérivé ; suppression sèche. Header licence : chat.ts en portait 0
(pas d'obligation).

---

## Sorties verbatim

### tsc server (gate dur, baseline 0)
```
pnpm --filter @zero/server exec tsc --noEmit → 0 error
```

### typecheck-report --blocking (server strict 0 · mail ≤17)
```
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   17 errors (baseline 17)
typecheck-report OK — no regression above baseline.
```

### route-inventory --assert (0 doublon)
```
AVANT : functionalDuplicates = 2  → exit 1
APRÈS : functionalDuplicates = 0  → exit 0
```

### wrangler deploy --dry-run
```
--env local   : Total Upload 21886.94 KiB / gzip 2744.12 KiB · all bindings · --dry-run: exiting now.  (OK)
--env staging : Total Upload 21886.94 KiB / gzip 2744.12 KiB · all bindings · --dry-run: exiting now.  (OK)
--env=""(nu)  : ERROR No loader for ".sql" — PRÉ-EXISTANT (règle loader sous env.local), non régressif.
```

### build mail
```
pnpm --filter @zero/mail build → ✓ built in 10.66s
```

### tests (pnpm test)
```
@zero/server:test  Test Files 2 passed (2)  Tests 7 passed (7)
@zero/mail:test    Test Files 1 passed (1)  Tests 2 passed (2)
```

### loc-ratchet
```
loc-ratchet: files > 800 LOC = 15 (budget entries 17)
loc-ratchet: cross-app frontier imports = 5 (max 5)
loc-ratchet: 2 budget entries prunable (info):
  - apps/server/src/routes/chat.ts (no longer present)
  - apps/server/src/main.ts (now 333 <= 800)
FAILED (2) — apps/mail/... contributors.tsx & command-palette-context.tsx
  → PRÉ-EXISTANT au HEAD (LOC identiques HEAD↔worktree), hors périmètre. Voir [F1].
```

### Surface Durable Object (gate 4) — inchangée
```
git diff --stat apps/server/wrangler.jsonc → (vide)
Classes DO exportées par l'entry main.ts : ShardRegistry, ThinkingMCP,
  ThreadSyncWorker, WorkflowRunner, ZeroAgent, ZeroDB, ZeroDriver, ZeroMCP
```

---

## Conformité périmètre

- **Touché** : `main.ts` (M), `routes/chat.ts` (D), `routes/index.ts` (new),
  `db/durable-objects.ts` (new, cf. [D2]), `docs/adr/**`,
  `scripts/checks/route-inventory.mjs`, ce rapport.
- **NON touché** (vérifié) : `routes/agent/**`, `lib/driver/**`,
  `lib/trpc-logging.ts`, `trpc/routes/**` (dont ai/), `apps/mail/**`,
  `packages/**`, `pnpm-lock.yaml`, `wrangler.jsonc` (diff vide), `.github/**`
  (lecture seule), `docs/checks/**` (lecture seule).
- Pas de commit (laissé à l'orchestrateur). Pas de placeholder.

---

STATUS: DONE — chat.ts mort supprimé (−1610), main.ts 1242→333, routes/index.ts 393 + db/durable-objects.ts 537 (tous ≤800), inventaire doublons 2→0, contrat HTTP 23/23 stable, tsc server 0 · mail 17, dry-run/build mail/tests verts, ADR posé ; loc-ratchet rouge PRÉ-EXISTANT hors périmètre (apps/mail, cf. [F1]) ; décision [D2] db/ à arbitrer.
