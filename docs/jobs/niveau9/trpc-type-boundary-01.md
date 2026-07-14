# Job niveau9/trpc-type-boundary-01 — V3.6 trpc-type-boundary (issue devlab-io/zero#43)

MIRROR: ORCHESTRATOR

Worktree : `.architect/wt/niveau9/trpc-type-boundary-01`
Branche : `job/niveau9/trpc-type-boundary-01`
HEAD au démarrage : `a7dc44630a07856107eeb39c9e9f6f30a0ac01e5` (vérifié — inclut @zero/types
mergé #25, guardrails #29, agent 12 modules #22, main.ts 333 #24, driver façade #23,
FRONTIER_MAX 0). Aucune divergence.

Porteur NOMINAL du gate `tsc mail = 0 TOTAL` — 2ᵉ et DERNIER transfert (D9). **Gate atteint.**

---

## PHASE 0 — Plan, design-it-twice & désaccords (cités sur fichiers réels)

### Plan (exécuté)

Couper les deux racines `@zero/server/trpc` (`AppRouter`) et `@zero/server/auth` (`Auth`) au
niveau de l'EXPOSITION des types, via une **frontière `.d.ts`** (le seul barrage que `tsc` ne
traverse pas), pour que le programme `tsc` de mail cesse de compiler les sources serveur.
Détail et preuves : `docs/adr/0006-trpc-type-boundary.md`.

1. Dé-Auth-ifier le contexte tRPC (`trpc/trpc.ts`) — façades leaf → procédures/`AppRouter`
   émissibles. 2. Isoler `serverTrpc` (`trpc/server-caller.ts`) — `index.ts` le re-exporte
   (contrat identique). 3. Générateur (`scripts/gen-trpc-boundary.mjs` + `tsconfig.boundary.json`)
   → `src/trpc/app-router.boundary.d.ts` (committé, déterministe). 4. `Auth` → `lib/auth.
   boundary.d.ts` (leaf + drift-test). 5. `apps/mail/tsconfig.json` `paths` redirige les deux
   specifiers ; retrait du shim dormroom mort. 6. Ratchet `BASELINE.mail 17→0`.

### Design-it-twice (esquisse ≥2, choix par preuve)

- **Piste A (RETENUE)** : frontière `.d.ts` émise via `tsc`, `ZeroEnv` **référencé puis
  neutralisé** (`Record<string, unknown>`) à la génération. Zéro nouvelle dépendance.
- **Piste B (REJETÉE, preuve)** : bundle self-contained (rollup-plugin-dts / api-extractor).
  Inline `ZeroEnv` → `ZERO_MCP: DurableObjectNamespace<ZeroMCP>` → plugin `mcp` better-auth →
  **MCPOptions resurgit** (TS2742 exact de #25). + devDep (lockfile interdit sans ruling).

Détail des 6 alternatives rejetées avec preuve : ADR 0006 §« Alternatives rejetées ».

### Désaccords / frontières flaggés (je continue)

**D1 — `serverTrpc` (`trpc/index.ts`) bloque l'émission de `AppRouter`.** Son type de caller
référence l'interne `@trpc/server` `unstable-core-do-not-import` (TS2742), indépendamment
d'Auth. Il n'a **aucun consommateur** (grep server+mail = 0) mais reste un export public
(`@zero/server/trpc`) — le retirer casserait le contrat (structure.md §2).
→ Résolution : déplacé dans `trpc/server-caller.ts` ; `index.ts` fait `export { serverTrpc }
from './server-caller'` (un re-export ne force pas le nommage du type — **mesuré** : `index.d.ts`
s'émet). Contrat public identique. Le générateur retire cette unique ligne de la frontière mail.

**D2 — `apps/server/src/ctx.ts` porte `Auth`/`ZeroEnv` et n'est PAS dans MAY TOUCH.** `HonoContext`
(`ctx.ts:15`) / `HonoVariables` (`ctx.ts:7`, `auth: Auth`) sont la source de la non-émissibilité,
mais `ctx.ts` est intouchable. → Résolution : `TrpcContext` est **redéfini localement** dans
`trpc/trpc.ts` (MAY TOUCH) avec des façades leaf, **sans** passer par `ctx.ts`. `ctx.ts` reste
intouché (diff vide). Sûr car `createContext` (routes/index.ts:181, hors périmètre) retourne déjà
`{c, sessionUser, db}` sans `auth` et compile — l'adaptateur `@hono/trpc-server` est typé lâche.

**D3 — `LoggingService(ctx.c.env: ZeroEnv)` (trpc/routes/logging.ts:15) interdit de neutraliser
`c.env` dans le contexte.** → Résolution : `c.env` reste `ZeroEnv` (alias **nommable**, jamais
un bloqueur d'émission) ; il n'est neutralisé que dans la frontière committée (client mail ne lit
jamais `ctx.c.env` — 18 occurrences, toutes en position `Bindings:`, vérifié).

**D4 — Fichiers infra hors listes MAY/MUST-NOT (requis par l'approche c sanctionnée).**
`trpc/server-caller.ts`, `tsconfig.boundary.json`, `scripts/gen-trpc-boundary.mjs`,
`*.boundary.d.ts`, `*.test-d.ts`, script npm `gen:trpc-boundary`. Aucun ne touche une zone
interdite ; ce sont les artefacts de « .d.ts committé + script de régénération vérifiable en CI »
(option c du spec). Flaggé, je continue.

**D5 — `route-inventory.mjs` lit en dur `trpc/index.ts` pour `router({`.** Un déplacement de
`appRouter` hors d'`index.ts` mettait ses namespaces à 0 (cosmétique — l'outil n'échoue que si
`functionalDuplicates>0`, et n'est PAS un check gelé). → Résolution : `appRouter` **reste défini
dans `index.ts`** (seul `serverTrpc` déménage), donc `route-inventory` est intact (17 namespaces,
80 procédures, functionalDuplicates=0 — mesuré). Zéro régression.

**Contrats préservés (rulings #21/#25/#29) :** projection.ts (#22), `mcp.ts:363` (loadedThread.
latest), `env.ts` intouché, re-exports arrière @zero/types intacts, better-auth 1.6.x intouchée.

---

## PHASE 2 — Build (terminé)

### Diagnostic (mesuré, séquence complète)

| État | tsc mail | tsc server |
|---|---|---|
| baseline (HEAD a7dc4463) | **17** (100 % `../server/src`, 0 sous `apps/mail/`) | 0 |
| frontière `@zero/server/trpc` seule | 17 (via racine auth) | 0 |
| frontières trpc **+** auth | **0** | 0 |

`--explainFiles` : les 17 fichiers sont tous inclus via `env.ts:1-2 → './main' + './routes/agent'`.
Émission-probe : seuls bloqueurs = `serverTrpc`, 3 procédures, `createAuth` — tous causés par
`auth: Auth` dans le contexte (zod v4 + MCPOptions). `appRouter`/`AppRouter`/`ZeroEnv` : PAS
bloqueurs.

### Livrables

1. **Contexte dé-Auth-ifié** — `trpc/trpc.ts` : `TrpcContext` façade leaf (`BoundarySessionUser
   {id,name,email}`, `BoundaryAuthApi {api:{signOut,deleteUser}}`, `c.env: ZeroEnv`). Runtime
   inchangé (cast `as unknown` dans `serverTrpc`). `ctx.ts` intouché.
2. **`serverTrpc` isolé** — `trpc/server-caller.ts` (déplacé), `index.ts` re-exporte (contrat
   `@zero/server/trpc` identique). `appRouter` reste défini dans `index.ts`.
3. **Frontière `AppRouter`** — `src/trpc/app-router.boundary.d.ts` généré par
   `scripts/gen-trpc-boundary.mjs` (émet `index.d.ts` via `tsconfig.boundary.json`, retire le
   re-export `serverTrpc`, neutralise `import("../env").ZeroEnv` → `Record<string, unknown>`).
   **Déterministe** : régénération → 0 diff. Filet de sécurité : refus si toute réf serveur-graphe
   résiduelle (`../env|main|routes/agent|pipelines|db|server-caller`).
4. **Frontière `Auth`** — `lib/auth.boundary.d.ts` (leaf, `api.getSession`), gardée par
   `lib/auth.boundary.test-d.ts` (assignabilité réel→boundary au gate `tsc server`).
5. **`apps/mail/tsconfig.json`** — `paths` : `@zero/server/trpc` + `@zero/server/auth` → frontières ;
   **shim dormroom retiré** (mort : `tsc mail` = 0 sans lui, vérifié).
6. **Type-tests (typage RÉEL, pas any/unknown dégradé)** :
   - `trpc/boundary.test-d.ts` (serveur) : maps I/O frontière ≡ vrai `index.ts` (assignabilité
     mutuelle) + spot-check `mail.listThreads`. **Prouve la fidélité bout-en-bout** ; casse
     `tsc server` si la frontière committée dérive.
   - `mail/lib/trpc-boundary.test-d.ts` (consommateur) : `brain.getPrompts` ≡ `Record<EPrompts,
     string>`, `mail.listThreads` I/O exacts.
7. **Ratchet** — `BASELINE.mail 17 → 0` (`scripts/checks/typecheck-report.mjs`, borne uniquement).

### Preuves verbatim (worktree fraîchement installé, séquence complète)

```
install --frozen-lockfile                      → exit 0
wrangler types (server --env local)            → exit 0
wrangler types (mail)                          → exit 0
react-router typegen (mail)                    → exit 0
tsc server (pnpm --filter @zero/server exec tsc --noEmit)  → 0 errors
tsc mail   (pnpm --filter @zero/mail   exec tsc --noEmit)  → 0 errors TOTAL
                                                 (0 sous apps/mail/, 0 sous ../server/src)
typecheck-report --blocking   → server: 0 (baseline 0) · mail: 0 (baseline 0) · OK
loc-ratchet                   → cross-app frontier imports = 0 (max 0) · PASSED
frontier grep (mail ../server/src)  → 0
@ts-nocheck (mail+server)     → 0
any-grep                      → mail 23/25 · server 14/15
boundary regen determinism    → git diff = 0 lines
route-inventory               → tRPC 80 procedures / 17 namespaces · functionalDuplicates=0 · exit 0

pnpm --filter @zero/server test → Test Files 5 passed | Tests 23 passed
pnpm --filter @zero/mail   test → Test Files 1 passed | Tests 2 passed
pnpm --filter @zero/mail build  → ✓ built in 9.33s (exit 0)
wrangler deploy --dry-run --env local (server) → Total Upload 21906 KiB · --dry-run: exiting now.
wrangler deploy --dry-run (mail)               → Total Upload 0.38 KiB · --dry-run: exiting now.
check-agent-surface           → passed: least scopes, bounded session cache, draft-only MCP
console-ratchet               → console(server)=132/132 console(front)=125/143 · PASSED
migrations-consistency        → PASSED (drift within documented allowlist)
```

### Frontières respectées (diff audit)

MAY TOUCH modifiés : `apps/mail/tsconfig.json`, `apps/server/package.json` (script + exports
inchangés), `apps/server/src/trpc/{index,trpc}.ts`, `scripts/checks/typecheck-report.mjs` (borne).
Nouveaux (infra/tests/artefacts, cf. D4) : `trpc/server-caller.ts`, `trpc/app-router.boundary.d.ts`,
`trpc/boundary.test-d.ts`, `lib/auth.boundary.d.ts`, `lib/auth.boundary.test-d.ts`,
`tsconfig.boundary.json`, `scripts/gen-trpc-boundary.mjs`, `mail/lib/trpc-boundary.test-d.ts`.
MUST NOT TOUCH — diff **vide** : `routes/agent/**` (0), `lib/driver/**` (0), `trpc/routes/**`
runtime (0), `apps/mail/components|hooks` (0), `pnpm-lock.yaml` (0), `.github/**` (0),
`docs/checks/**` (0), `ctx.ts` (0), `lib/auth.ts` runtime (0 — better-auth 1.6.x intouchée).

### CI de vérification de la frontière (régénération vérifiable)

`pnpm --filter @zero/server gen:trpc-boundary && git diff --exit-code
apps/server/src/trpc/app-router.boundary.d.ts` (déterministe). Double garde : le drift casse
aussi le gate `tsc server` via `boundary.test-d.ts`.

### Points soumis au jugement (transparence)

- La frontière `AppRouter` est un `.d.ts` **généré + committé** ; la neutralisation
  `import("../env").ZeroEnv → Record<string, unknown>` est une substitution scriptée déterministe,
  portant uniquement sur le contexte `c.env` (jamais consommé par le client tRPC) — la fidélité I/O
  est prouvée intacte par `boundary.test-d.ts`. Conforme à l'option (c) du spec (« .d.ts committé +
  script de régénération vérifiable en CI »).
- `lib/auth.boundary.d.ts` est fidèle mais minimale (le type `Session` dérivé est **inutilisé**
  dans mail — vérifié) ; le drift-test garantit qu'elle ne ment pas.

STATUS: COMPLETE — gate `tsc mail = 0 TOTAL` + `tsc server = 0` atteint sous la séquence complète (mesuré) ; BASELINE.mail 17→0 ; typage AppRouter RÉEL prouvé (boundary.test-d.ts : I/O frontière ≡ vrai router, mutuellement assignables ; aucun any/unknown dégradé) ; shim dormroom retiré ; comportement inchangé (server 23 + mail 2 tests, build mail, dry-run ×2, check-agent-surface, console-ratchet, migrations, route-inventory tous verts) ; better-auth 1.6.x intouchée ; frontière déterministe (regen 0 diff) + double-gardée ; ADR 0006 livré ; toutes frontières MUST-NOT-TOUCH à diff vide. Non commité.
