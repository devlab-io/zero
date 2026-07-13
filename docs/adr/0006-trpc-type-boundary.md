# ADR 0006 — Frontière de types `AppRouter`/`Auth` apps/mail ↔ apps/server (V3.6)

Statut : Accepté
Date : 2026-07-13
Issue : devlab-io/zero#43 — [niveau9] V3.6 trpc-type-boundary (corrective, porteur nominal
du gate `tsc mail = 0 TOTAL`, 2ᵉ et dernier transfert).
Contexte de mesure : worktree `job/niveau9/trpc-type-boundary-01`, HEAD de départ
`a7dc4463`, séquence complète (`pnpm install --frozen-lockfile` + `wrangler types` ×2 +
`react-router typegen`).

## Contexte

`apps/mail` consomme deux **types** du serveur : `AppRouter` (client tRPC, 4 sites) et
`Auth` (dérivation `Session`, 1 site — `lib/auth-client.ts`). Les deux sont importés
`import type`, mais `tsc` doit tout de même charger et type-checker le graphe transitif du
module cible (un import `.ts` — même type-only — met tout le graphe atteignable dans le
programme). Résultat mesuré (baseline, séquence complète) : **`tsc mail` = 17 erreurs**,
toutes dans `../server/src/**` compilé sous l'`Env` de mail (8 `workflow-functions`, 4
`bulk-delete`, 3 `agent/mcp`, 1 `migrations.js`, 1 `chat-agent`). `tsc server` = 0.

`--explainFiles` confirme la racine unique du graphe lourd : **`apps/server/src/env.ts:1-2`**
(`import type … from './main'` + `'./routes/agent'`, pour typer les `DurableObjectNamespace`
avec les classes DO concrètes). `env.ts` est foundational (atteint par `@zero/server/trpc`
via les routes → `server-utils`/`ctx` → `env`, ET par `@zero/server/auth` via `createAuth`
→ `env`). Les DEUX racines tirent indépendamment `env.ts → main.ts` → les 17.

Contraintes du dossier (échecs #25/#29, non répétés) : (a) `env.ts → './main'` **ne peut
pas** être cassé — les types DO concrets sont consommés par `server-utils.ts`, `pipelines.ts`
(#31) et `routes/agent/sync.ts:99` (#42), hors périmètre ; découpler `env.ts` localement
mesure server 0→76 / mail 17→97. (b) L'émission `.d.ts` naïve échoue TS2742/TS4023 :
`createAuth`, `serverTrpc`, les procédures portent des types non-portables (zod v4 bundlée
par better-auth via `zod/v4/core`, `MCPOptions` d'un sous-chemin interne non exporté).

## Diagnostic affiné (mesuré, ce job)

Émission de déclarations (tsc `--emitDeclarationOnly`) exécutée et lue site par site :
les seuls exports non-émissibles sont `serverTrpc` (interne `@trpc/server`
`unstable-core-do-not-import`), les 3 procédures et `createAuth` — **tous** parce que le
**contexte tRPC porte `auth: Auth`** (via `HonoVariables`) et que `Auth` n'est même pas
*référençable* (son alias `ReturnType<typeof createAuth>` doit être expansé et bute sur
MCPOptions/zod v4). `appRouter`/`AppRouter` **ne sont PAS** dans la liste des bloqueurs, et
aucune erreur ne porte sur `ZeroEnv` (alias concret nommable en relatif). Cartographie du
contexte : `ctx.auth` (top-level) n'est **jamais** lu (seulement `ctx.c.var.auth.api.
{signOut,deleteUser}`) ; `ctx.sessionUser` n'accède qu'à `.id/.email/.name` et **ne fuit
dans aucun output** de procédure ; `createContext` (routes/index.ts:181, hors périmètre)
retourne déjà `{c, sessionUser, db}` sans `auth` et compile (l'adaptateur `@hono/trpc-server`
est typé lâche) → `TrpcContext` est redéfinissable sans casser les routes.

## Design-it-twice

Le seul barrage que `tsc` ne traverse pas est un `.d.ts` auto-contenu. Les deux racines
(`@zero/server/trpc`, `@zero/server/auth`) doivent donc être résolues depuis des `.d.ts`
sans arête vers `env.ts → main`. Deux esquisses partageant ce socle :

**Piste A (RETENUE) — frontière `.d.ts` émise + contexte dé-Auth-ifié + env neutralisé.**
1. Redéfinir `TrpcContext` (dans `trpc/trpc.ts`, MAY TOUCH) avec des **façades leaf** au lieu
   de `Auth`/`SessionUser`/`HonoContext` : `auth` → surface minimale `{api:{signOut,
   deleteUser}}`, `sessionUser` → `{id,name,email}`, `c.env` → `ZeroEnv` (nommable). Purge
   `Auth` du type du router → procédures/`appRouter` **émissibles** (mesuré : les TS2742/4023
   disparaissent). Runtime inchangé (objets better-auth réels ; cast interne dans `serverTrpc`).
2. Isoler `serverTrpc` (seul bloqueur restant, interne @trpc) dans `trpc/server-caller.ts` ;
   `index.ts` le **re-exporte** (un re-export ne force pas le nommage du type — mesuré : la
   déclaration de `index.ts` s'émet malgré tout) → contrat public `@zero/server/trpc` identique.
3. Générateur `scripts/gen-trpc-boundary.mjs` : émet `index.d.ts`, retire la ligne de re-export
   `serverTrpc`, et remplace `import("../env").ZeroEnv` (18 occurrences, **toutes** en position
   `Bindings:` — client jamais consommé) par `Record<string, unknown>`. Sortie committée
   `src/trpc/app-router.boundary.d.ts`, déterministe (régénération → 0 diff, vérifiable CI).
4. `Auth` : `lib/auth.boundary.d.ts` (leaf hand-authored, surface `api.getSession`), gardé par
   un test de dérive assérant l'assignabilité réel→boundary.
5. `apps/mail/tsconfig.json` `paths` redirige `@zero/server/trpc` et `@zero/server/auth` vers
   ces `.d.ts`. Les autres refs de la frontière (`../types`, `../types/logging`, `../lib/
   cookies`, `../lib/draft-outbox`) sont **leaf** (vérifié : n'importent que node_modules +
   `@zero/types`) → mail les résout vers les vrais fichiers sans tirer le graphe.

**Piste B (REJETÉE) — bundle `.d.ts` self-contained (rollup-plugin-dts / api-extractor).**
Après dé-Auth-ification, bundler `AppRouter` dans un seul `.d.ts` en **inline** tout le
closure. Rejetée par **preuve** : `ZeroEnv` inline tire `ZERO_MCP: DurableObjectNamespace<
ZeroMCP>` → `ZeroMCP` (routes/agent/mcp) utilise le plugin `mcp` de better-auth → **MCPOptions
resurgit** (le TS2742 exact que #25 a rencontré avec rollup-plugin-dts). En Piste A, `ZeroEnv`
est **référencé puis neutralisé**, jamais inlinée → MCPOptions n'entre jamais dans la
frontière. Coût additionnel de B : devDep d'émission (lockfile, interdit sans ruling) pour un
résultat qui échoue. La Piste A n'utilise que `tsc` (zéro dépendance nouvelle).

## Décision

**Piste A.** `tsc mail = 0 TOTAL` et `tsc server = 0` sous la séquence complète (mesuré).
Contrat tRPC **identique** (17 namespaces, 80 procédures, `route-inventory
functionalDuplicates=0`) ; fidélité I/O **prouvée** par `trpc/boundary.test-d.ts` (les maps
`inferRouterInputs`/`Outputs` de la frontière ≡ celles du vrai `index.ts`, mutuellement
assignables — au gate `tsc server`), donc la frontière committée ne peut pas dériver du vrai
router sans casser le typecheck serveur. Shim `dormroom` de mail **retiré** (mort : `tsc mail`
= 0 sans lui). better-auth 1.6.x **intouchée** (`lib/auth.ts` diff vide).

## Alternatives rejetées (avec preuve)

1. **Casser `env.ts → './main'`** (dérivation `Cloudflare.Env` ou stubs structurels) — rejeté :
   #29 mesure server 0→76 / mail 17→97 ; `routes/agent/sync.ts:99` (#42) et `pipelines.ts`
   (#31), hors périmètre, consomment les types DO concrets → toute reconstruction re-tire le
   graphe. `env.ts → main` est irréductible tant que ces consommateurs existent.
2. **Émission `.d.ts` naïve** (option 1 du spec, sans dé-Auth) — rejeté : TS2742/TS4023 sur
   `serverTrpc`/procédures/`createAuth` (reproduit ce job). Cause racine : `Auth` dans le
   contexte. La Piste A retire précisément cette cause.
3. **Contexte type-only seul** (option a du spec, sans frontière `.d.ts`) — rejeté : neutraliser
   le contexte ne coupe PAS l'arête *module* (mail charge toujours `@zero/server/trpc` = la
   source `index.ts` → routes → `env.ts → main`). Nécessaire (catalyseur d'émissibilité) mais
   insuffisant seul.
4. **`paths` sur specifier relatif** (option 3 du spec) — rejeté : `tsc` n'applique `paths`
   qu'aux specifiers bare ; l'arête poison est relative. La Piste A la contourne en émettant une
   frontière `.d.ts` (barrage) et en neutralisant `../env` à la génération.
5. **Bundle self-contained** — rejeté : cf. Piste B (MCPOptions resurgit à l'inline de `ZeroEnv`).
6. **Déplacer `AppRouter`/`Auth` dans un package** (option 2 du spec) — rejeté : `AppRouter =
   typeof appRouter` / `Auth = typeof createAuth` sont liés à des valeurs serveur ; non déplaçables.

## Conséquences

- `apps/mail` ne compile plus aucune source serveur (17 → 0). `BASELINE.mail` 17 → 0 (ratchet).
- La frontière est **générée + committée + déterministe** : CI = `pnpm --filter @zero/server
  gen:trpc-boundary && git diff --exit-code apps/server/src/trpc/app-router.boundary.d.ts`.
  Double garde : le test `boundary.test-d.ts` casse le gate `tsc server` si la frontière dérive.
- Nouveaux fichiers infra (hors listes MAY, justifiés) : `trpc/server-caller.ts` (isolation
  d'exposition de type), `tsconfig.boundary.json` + `scripts/gen-trpc-boundary.mjs` (générateur),
  `*.boundary.d.ts` (artefacts option c), `*.test-d.ts` (tests de types), script npm
  `gen:trpc-boundary`. `apps/server/src/ctx.ts` **intouché** (façades définies dans `trpc.ts`).
- Limite connue : `Auth['api']['getSession']` (type `Session`) est **inutilisé** dans mail ; la
  façade `lib/auth.boundary.d.ts` est fidèle (drift-test réel→boundary) mais volontairement
  minimale. Si un futur consommateur mail lit un champ de session absent de la façade, le
  `tsc mail` le signalera et la façade sera étendue (le drift-test garantit qu'elle ne ment pas).
