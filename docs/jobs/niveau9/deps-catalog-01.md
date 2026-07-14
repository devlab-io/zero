# Job niveau9/deps-catalog-01 — V1.3 deps-catalog (issue devlab-io/zero#18)

Branche `job/niveau9/deps-catalog-01` — HEAD de départ `a8ef30bc9c0c1efdfedd5e775abd4892f7517252` (vérifié).
MIRROR: ORCHESTRATOR.

---

## PHASE 0 — Plan + désaccords (avant tout code)

### Versions vérifiées contre le pnpm-lock.yaml vivant

Extraction des importers `apps/mail` / `apps/server` du lock (specifier → version résolue) :

| dep | mail spec | mail résolu | server spec | server résolu | cible catalog | mouvement |
|---|---|---|---|---|---|---|
| `agents` | `0.0.93` | 0.0.93 | `0.0.106` | 0.0.106 | **`0.0.106`** | mail ↑ 0.0.93→0.0.106 |
| `ai` | `^4.3.9` | 4.3.16 | `^4.3.13` | 4.3.16 | **`^4.3.13`** | aucun (déjà 4.3.16 des 2 côtés) |
| `@react-email/components` | `^0.0.36` | 0.0.36 | `^0.0.41` | 0.0.41 | **`^0.0.41`** | mail ↑ 0.0.36→0.0.41 |
| `resend` | `4.1.2` | 4.1.2 | `^4.5.1` | 4.6.0 | **`^4.5.1`** | mail ↑ 4.1.2→4.6.0 |
| `@types/node` | `22.13.8` | 22.13.8 | `^22.9.0` | 22.15.29 | **`^22.15.21`** (orphelin préexistant, préservé) | mail ↑ 22.13.8→22.15.29 |
| `@types/react` | `19.0.10` | 19.0.10 | `19.1.6` | 19.1.6 | **`19.1.6`** | mail ↑ 19.0.10→19.1.6 |
| `date-fns` | `4.1.0` | 4.1.0 | `^4.1.0` | 4.1.0 | **`^4.1.0`** | aucun |
| `dedent` | `^1.5.3` | 1.6.0 | `^1.6.0` | 1.6.0 | **`^1.6.0`** | aucun |
| `email-addresses` | `5.0.0` | 5.0.0 | `^5.0.0` | 5.0.0 | **`^5.0.0`** | aucun |
| `eslint` | `9.27.0` | 9.27.0 | `^9.27.0` | 9.27.0 | **`^9.27.0`** | aucun |

**Règle appliquée** : la cible catalog = le specifier le plus haut des deux apps, forme préservée
(exactement le pattern imposé par l'objectif : `agents 0.0.93/0.0.106 → 0.0.106`, `ai ^4.3.9/^4.3.13 → ^4.3.13`).
Dans tous les cas c'est le specifier de `server` (ou égalité). **Toutes les cibles résolvent vers une
version DÉJÀ présente dans le lock** (0.0.106, 4.3.16, 0.0.41, 4.6.0, 22.15.29, 19.1.6, 4.1.0, 1.6.0,
5.0.0, 9.27.0) → zéro bump au-delà du lock. Tout le mouvement de versions = **mail rattrape server**
(server porte déjà les versions hautes) → risque de dérive de types concentré et borné côté mail.

### Désaccords / écarts constatés (citant les fichiers réels)

1. **« catalog existant, 15 entrées » inexact.** `pnpm-workspace.yaml` lignes 7-20 comptent **14**
   entrées, pas 15. De plus le lock (`catalogs.default`) n'en matérialise que **13** : `@types/node`
   en est absent (voir §2). Non bloquant, corrigé au tableau ci-dessous.

2. **`@types/node` est une entrée catalog ORPHELINE.** `pnpm-workspace.yaml:10` déclare
   `@types/node: ^22.15.21` mais **aucun importer ne la consomme** (absente de `catalogs.default` du
   lock ; mail pin `22.13.8`, server `^22.9.0`, racine `24.3.0`). Mon alignement la rend vivante pour
   mail+server (→ 22.15.29). Je **préserve `^22.15.21`** (plancher plus haut que les deux specs d'app)
   plutôt que de l'abaisser à `^22.9.0`.

3. **Racine `@types/node: 24.3.0` NON alignée** (`package.json:46`). L'aligner au catalog serait un
   **downgrade MAJEUR** (24→22), interdit par « AUCUN bump majeur » et régression de résolution (le
   tooling racine — tsx/nizzy/postinstall — type contre Node 24). La divergence **mail↔server** (la
   cible de l'objectif) est bien éliminée ; il reste une divergence racine↔apps documentée et assumée.

4. **`scripts/package.json` (resend `4.5.1`) n'est PAS membre du workspace.** Le glob
   `pnpm-workspace.yaml:4` = `scripts/*` matche les sous-répertoires de `scripts/`, pas `scripts/`
   lui-même ; le lock n'a **aucun importer `scripts:`** et resend@4.5.1 est **absent du lock**. Hors
   graphe → je n'y touche pas.

5. **`@types/react` dans `packages/testing` est un `peerDependencies: "*"`** (`packages/testing/package.json:30`),
   pas un pin de version → pas une vraie divergence, laissé intact (cohérent avec décision #16
   « @zero/testing conservé »).

6. **`eslint` a un 3ᵉ consommateur réel : `packages/eslint-config` (`^9.27.0`)** (`packages/eslint-config/package.json:9`).
   Je l'aligne aussi au `catalog:` (résolution identique 9.27.0, risque nul) pour une source de vérité
   unique. Extension mineure « dans l'esprit » au-delà de la paire mail/server littérale — signalée.

7. **`@zero/cli` (`packages/cli`)** : aucune des 10 deps consommée. Conservé, consommé par `nizzy`
   (`package.json:9`) + `postinstall` racine (`package.json:10`). Statut documenté, aucun changement.

### Plan d'exécution

- **`pnpm-workspace.yaml`** : ajouter 9 entrées catalog (`@react-email/components`, `@types/react`,
  `agents`, `ai`, `date-fns`, `dedent`, `email-addresses`, `eslint`, `resend`) ; conserver `@types/node`
  (`^22.15.21`) et `better-auth` (`1.6.23`, gelé) intacts. Ordre alphabétique préservé.
- **`apps/mail/package.json`** : 10 deps → `"catalog:"`.
- **`apps/server/package.json`** : 10 deps → `"catalog:"`.
- **`packages/eslint-config/package.json`** : `eslint` → `"catalog:"`.
- **Racine `package.json`** : `@types/node` INCHANGÉ (24.3.0).
- `pnpm install` (non-frozen) régénère le lock.
- Preuves : install / `pnpm test` (9) / `pnpm --filter @zero/mail build` / dry-run wrangler server
  (forme ci.yml `--env local --outdir`) / `type-ratchet.mjs` + `console/loc/migrations` ratchets.
  **Preuve additionnelle anti-dérive** (mandat « stabilisée par toi ») : `wrangler types` (server+mail)
  puis `typecheck-report.mjs` — mail ≤ baseline 135, server ≤ baseline 82. Toute régression = bisect
  de la dep fautive, exclusion documentée comme « impossibilité technique ».

---

## Résultat — tableau dep → avant (mail/server) → après (catalog)

Entrée catalog + `"dep": "catalog:"` dans chaque consommateur. Résolution vérifiée dans le lock régénéré
(`catalogs.default`). **Toute résolution = version déjà présente dans le lock avant install → 0 bump au-delà du lock.**

| dep | avant mail | avant server | catalog (spec → résolu) | après mail | après server | majeur ? |
|---|---|---|---|---|---|---|
| `agents` | `0.0.93` | `0.0.106` | `0.0.106` → 0.0.106 | 0.0.106 | 0.0.106 | non (0.0.x) |
| `ai` | `^4.3.9` | `^4.3.13` | `^4.3.13` → 4.3.16 | 4.3.16 | 4.3.16 | non |
| `@react-email/components` | `^0.0.36` | `^0.0.41` | `^0.0.41` → 0.0.41 | 0.0.41 | 0.0.41 | non (0.0.x) |
| `resend` | `4.1.2` | `^4.5.1` | `^4.5.1` → 4.6.0 | 4.6.0 | 4.6.0 | non (4.x) |
| `@types/node` | `22.13.8` | `^22.9.0` | `^22.15.21` → 22.15.29 | 22.15.29 | 22.15.29 | non (22.x) |
| `@types/react` | `19.0.10` | `19.1.6` | `19.1.6` → 19.1.6 | 19.1.6 | 19.1.6 | non (19.x) |
| `date-fns` | `4.1.0` | `^4.1.0` | `^4.1.0` → 4.1.0 | 4.1.0 | 4.1.0 | non |
| `dedent` | `^1.5.3` | `^1.6.0` | `^1.6.0` → 1.6.0 | 1.6.0 | 1.6.0 | non |
| `email-addresses` | `5.0.0` | `^5.0.0` | `^5.0.0` → 5.0.0 | 5.0.0 | 5.0.0 | non |
| `eslint` | `9.27.0` | `^9.27.0` | `^9.27.0` → 9.27.0 | 9.27.0 | 9.27.0 | non |

Consommateur additionnel aligné : `packages/eslint-config` `eslint ^9.27.0` → `catalog:` (résolu 9.27.0, identique).
Tout le mouvement effectif = **mail rattrape server** (5 deps : agents, @react-email/components, resend, @types/node, @types/react).
`better-auth` **intact** (`1.6.23`, gelé). `@types/node` racine **intacte** (`24.3.0`, majeur — non aligné, cf. PHASE 0 §3).

### Statut `@zero/cli` (demandé)
`packages/cli/package.json` ne consomme **aucune** des 10 deps (deps : `@clack/prompts`, `@zero/tsconfig` workspace, `tiny-glob`).
**Conservé**, consommé par `nizzy` (`package.json:9` → `tsx ./packages/cli/src/cli.ts`) et `postinstall` racine (`package.json:10` → `pnpm nizzy sync`). Aucun changement.

### Statut `@zero/testing`
Conservé (décision #16 mergée). `@types/react` y est un `peerDependencies: "*"` (pas un pin) — intact.

---

## Preuves (sorties verbatim)

### 1. `pnpm install` — VERT (Done in 22.1s)
```
+ @types/node 24.3.0 (26.1.1 is available)   ← racine intacte
Done in 22.1s using pnpm v10.15.0
```
Peers non satisfaits affichés = préexistants annoncés par l'objectif (non introduits par moi ; server portait déjà agents@0.0.106) :
```
apps/mail  └─┬ react-day-picker … unmet peer date-fns@"^2.28.0 || ^3.0.0": found 4.1.0
apps/server └─┬ hono-agents 0.0.83 └── unmet peer agents@^0.0.93: found 0.0.106
packages/testing └─┬ @testing-library/react 14.3.1 ├── unmet peer react@^18.0.0: found 19.1.0
```

Lock en phase — étape install exacte du CI (`--frozen-lockfile --ignore-scripts`) :
```
Done in 2.2s using pnpm v10.15.0
frozen exit: 0
```

### 2. `pnpm test` — VERT (9 tests)
```
@zero/server:test:  Test Files  2 passed (2)    Tests  7 passed (7)
@zero/mail:test:    Test Files  1 passed (1)    Tests  2 passed (2)
 Tasks:    2 successful, 2 total     Time: 2.092s
=== test exit: 0 ===
```
Total = 7 (server) + 2 (mail) = **9 tests**.

### 3. `pnpm --filter @zero/mail build` — VERT
```
✓ 801 modules transformed.
✓ built in 9.79s
=== mail build exit: 0 ===
```
(Warning esbuild CSS `Unexpected ")"` sur `cm-content::selection:where()` = quirk CSS CodeMirror préexistant, sans lien avec les deps ; build réussi.)

### 4. Dry-run wrangler server — VERT (forme ci.yml)
`pnpm --filter @zero/server exec wrangler deploy --dry-run --env local --outdir .architect/tmp/zero-server-dry-run`
```
env.AI                                    AI
… (bindings KV/Queue/Vectorize/Hyperdrive/R2/env résolus) …
--dry-run: exiting now.
=== server dry-run exit: 0 ===
```
Gate CI mail (bonus, `pnpm --filter @zero/mail exec wrangler deploy --dry-run --outdir …`) — VERT aussi :
```
Total Upload: 0.38 KiB / gzip: 0.27 KiB     No bindings found.
--dry-run: exiting now.
=== mail dry-run exit: 0 ===
```

### 5. Ratchets — VERTS
```
type-ratchet: any(mail)=79/79  any(server)=91/91  any(total)=170/170 → PASSED (exit 0)
loc-ratchet: files > 800 LOC = 17 (budget 17) ; frontier imports = 5 (max 5) → PASSED (exit 0)
console-ratchet: console(server)=462/462  console(front)=143/143 → PASSED (exit 0)
migrations-consistency: 42 sql/39 journalled/3 orphan (allowlist) → PASSED (exit 0)
```

### 6. Anti-dérive de types (mandat « stabilisée par toi ») — VERT, AMÉLIORÉ
`wrangler types` (server `--env local` + mail) puis `node scripts/checks/typecheck-report.mjs` :
```
typecheck-report [mode=report]
  server: 82 errors (baseline 82)     ← inchangé
  mail:   95 errors (baseline 135)    ← -40, "baseline can be lowered"
typecheck-report OK — no regression above baseline (baseline can be lowered).
=== exit: 0 ===
```
L'alignement **ne crée aucune dérive** et **résorbe 40 erreurs tsc côté mail** (mail passait sur des `@types/react`/`@types/node`/`ai`/`agents` plus anciens que server, qui était déjà typé contre les versions hautes). Les issues #20/#21, en rebasant sur ce merge, héritent d'une baseline mail plus basse (95 vs 135).

---

## Surface de changement (aucun commit — HEAD toujours `a8ef30bc`)
```
 M apps/mail/package.json
 M apps/server/package.json
 M packages/eslint-config/package.json
 M pnpm-lock.yaml
 M pnpm-workspace.yaml
?? docs/jobs/niveau9/deps-catalog-01.md
```
`worker-configuration.d.ts` (généré par wrangler types) et `apps/mail/build/` sont gitignorés — hors surface.
BOUNDARIES respectées : aucun src, `.github/**`, `docs/checks/**`, `.husky/**`, `turbo.json`, `vitest.config.ts`, `scripts/**` touché.

MIRROR: ORCHESTRATOR

STATUS: COMPLETE

