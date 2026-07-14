# Baseline grading — architecture niveau9

- **Date** : 2026-07-12
- **HEAD SHA** : `140a6cf79fdbe988cb995eb1e83721dfdcbbd853` (branche `factory/niveau9`)
- **Protocole** : juge froid, baseline. Barème appliqué : `docs/checks/niveau9/grading-rubric.md`.
- **Environnement de preuve** : `pnpm install --frozen-lockfile --ignore-scripts` (exit 0), `wrangler types` généré pour `@zero/server` et `@zero/mail` (exit 0), puis `tsc --noEmit` par app. Toute commande listée ci-dessous a été exécutée en lecture seule.

Paliers binaires : un critère non prouvé = non acquis. Note d'axe = 7 ou 9 si le palier est intégralement satisfait ; sinon la note inférieure qui correspond à l'état réel.

---

## A1 — Frontières & modularité — **4/10**

Commande LOC : `find apps/*/src apps/mail/{app,components,lib,hooks,store} -name '*.ts*' ! -name '*.d.ts' | xargs wc -l | sort -rn`

- **Palier 7 — NON acquis.**
  - « 0 fichier src >1200 LOC » : **9 fichiers >1200 LOC** (343 fichiers comptés). Pires : `apps/server/src/routes/agent/index.ts` = **2274**, `apps/mail/components/context/command-palette-context.tsx` = 1913, `icons.tsx` = 1783, `mail-display.tsx` = 1736, `chat.ts` = 1610, `driver/google.ts` = 1487, `HomeContent.tsx` = 1332, `driver/microsoft.ts` = 1294, `main.ts` = 1261. → **FAIL**.
  - « 0 import `../../../server` ou `../../server/src` dans apps/mail » : **5 imports profonds** dans 4 fichiers (`ai-sidebar.tsx`, `prompts-dialog.tsx` ×2, `mail-list.tsx`, `use-threads.ts`). → **FAIL**.
- **Palier 9 — NON acquis.** `scripts/checks/loc-ratchet` absent (répertoire `scripts/checks/` inexistant) ; **17 fichiers >800 LOC** ; règle ESLint `no-restricted-imports` **absente** (0 occurrence dans `apps/*/eslint.config.ts` et `packages/eslint-config`) ; package **`@zero/types` absent** de `packages/` ; pas d'inventaire de routes committé ; `components/` partiellement organisé par domaine, sans index systématique.
- **Acquis partiels** : monorepo structuré (apps/mail, apps/server, packages/{cli,eslint-config,testing,tsconfig}) ; 11 des 16 imports serveur passent par l'alias `@zero/server/*` (types-only pour la plupart).

## A2 — Type safety — **3/10**

- **Palier 7 — NON acquis.**
  - `pnpm --filter @zero/server exec tsc --noEmit` (après `wrangler types`) : **exit 1, 83 erreurs `TS`** (ex. `Property 'OPENAI_API_KEY' does not exist on type 'Env'`, `getDraft ... not assignable to MailManager`). → **FAIL**.
  - `pnpm --filter @zero/mail exec tsc --noEmit` : **exit 1, 135 erreurs `TS`**. Une partie provient du codegen non exécuté (`@/paraglide/messages`, `./+types/page` de react-router), mais des erreurs réelles subsistent (`ZodObject ... not assignable to ZodType<FieldValues>`). → **FAIL**.
  - Étape typecheck bloquante en CI : **absente** de `ci.yml` (0 occurrence de `tsc`/`noEmit`/`typecheck`).
- **Palier 9 — NON acquis.** Sur le périmètre src : **`: any` = 126**, **`as any` = 41** (≫ budget ≤40) ; **`@ts-nocheck` = 1 fichier** (budget 0) ; `@ts-expect-error` = 4, `@ts-ignore` = 1 ; aucun ratchet types en CI.

## A3 — Tests & vérifiabilité — **2/10**

- **Palier 7 — NON acquis.**
  - Racine : `"test": "pnpm --filter=@zero/testing test"`. Or `@zero/testing` **n'a aucun script `test`** (uniquement `test:e2e` playwright). `pnpm test` → **exit 0 mais n'exécute aucun test** (no-op). → **FAIL** (pas de turbo, pas d'exécution réelle).
  - « les 3 fichiers de tests hérités sont exécutés » : les 3 fichiers unitaires (`apps/mail/components/queue/queue-view-model.test.ts`, `apps/server/src/lib/draft-outbox/state-machine.test.ts`, `apps/server/src/lib/mail-sanitize/index.test.ts`) **ne sont câblés à aucun runner** — aucune config vitest trouvée ; `vitest` n'est dépendance que de `@zero/testing` (`vitest run` sous `@zero/mail` → `Command "vitest" not found`). → **FAIL**.
  - Tâche `test` bloquante en CI : **absente**.
- **Palier 8,5 / 9 — NON acquis.** Aucune couverture prouvée ; `docs/testing.md` **absent**.
- **Acquis partiels** : 3 fichiers de tests unitaires + 5 specs e2e playwright (`packages/testing/e2e/*.spec.ts`) présents sur disque.

## A4 — CI/CD & gates — **5/10**

Fichier : `.github/workflows/ci.yml` (`timeout-minutes: 20`).

- **Palier 7 — NON acquis (4/6 gates présents).**
  - frozen install (`pnpm install --frozen-lockfile --ignore-scripts`) — **présent**.
  - `check-agent-surface.mjs` — **présent**.
  - `pnpm audit --prod --audit-level critical` — **présent**.
  - build mail (`pnpm --filter @zero/mail build`) — **présent**.
  - typecheck bloquant — **ABSENT**. → FAIL.
  - tests bloquants — **ABSENT**. → FAIL.
  - (extras hors barème : oxlint sur fichiers sécurité, `wrangler deploy --dry-run`.)
- **Palier 9,5 — NON acquis.** Pas de `wrangler types` avant typecheck ; **lint non épinglé même version** (hook `.husky/pre-commit` = `oxlint@1.9.0`, CI = `oxlint@latest`) ; **gitleaks absent** ; ratchets LOC/types/console absents ; check migrations absent ; **gate deploy absent** — `deploy-to-prod-command.yml` rebase + `git push --force-with-lease origin main` **sans exiger CI verte** (`workflow_run`/`needs` absents) ; **lint-staged configuré mais non branché** (le hook pre-commit lance oxlint, pas `lint-staged`).

## A5 — Observabilité & erreurs — **2/10**

- **Palier 7 — NON acquis (1/3).**
  - `grep -rc 'console\.' apps/server/src` total = **465** (budget ≤60). → **FAIL** (~8×).
  - « 0 catch strictement vide » : `grep -rnE 'catch\s*\([^)]*\)\s*\{\s*\}'` = **0**. → **PASS**.
  - Sentry actif côté Worker (init + capture dans le fetch handler) : **0 occurrence** de `Sentry`/`@sentry`/`toucan`/`withSentry` dans `apps/server/src`. → **FAIL**.
- **Palier 8,5 — NON acquis.** Console front `apps/mail` = **153** (budget ≤40) ; pas de ratchet ; `tracing.ts` = **stub de 9 lignes** non implémenté et non statué par ADR.

## A6 — Données, migrations & config — **3/10**

- **Palier 7 — NON acquis.**
  - Journal Drizzle == disque : **42 fichiers `.sql`** sur disque (`apps/server/src/db/migrations/`) vs **40 entrées** dans `meta/_journal.json` → **2 orphelins**. Préfixes numériques **dupliqués** : 0025, 0029, 0032, 0035 (38 préfixes distincts pour 42 fichiers). → **FAIL**.
  - Env validé par zod au boot des 2 workers : `apps/server/src/env.ts` = **simple cast** `const env = _env as ZeroEnv` — **aucun zod, aucune validation, aucun échec lisible** au boot. → **FAIL**.
- **Palier 9,5 — NON acquis.** Check `migrations-consistency` absent ; 2ᵉ config drizzle présente (`apps/server/src/routes/agent/db/drizzle/`) non statuée par ADR ; **`.dev.vars.example` absent** ; pas de garde `db:push` prod documentée.
- **Acquis partiels** : migrations gérées par Drizzle (journal présent, ~38 migrations), `drizzle.config.ts` présent.

## A7 — Sécurité — **7/10**

- **Palier 7 — ACQUIS (3/3).**
  - `pnpm audit --prod --audit-level critical` → **exit 0** (0 advisory critical ; sur 164 vulns : 16 low / 77 moderate / 71 high). → **PASS**.
  - `node scripts/security/check-agent-surface.mjs` → **exit 0** : « least scopes, bounded session cache, draft-only MCP ». → **PASS**.
  - Scopes conformes à `google-scopes.ts` : `mail.google.com` **absent** des scopes runtime (seulement cité en commentaire comme exclu). → **PASS**.
- **Palier 9 — NON acquis.** `docs/research/niveau9/audit-triage.md` **absent** → 71 high + 77 moderate **non triés** ; **gitleaks CI + scan historique absents** ; `security.md` non prouvé intégral.

## A8 — Performance structurelle — **2/10**

- **Palier 7 — NON acquis.**
  - « aucun GIF >1 MB dans public/ » : **3 GIFs >1 MB** — `onboarding/step2.gif` = 19,2 MB, `step1.gif` = 19,1 MB, `step3.gif` = 10,4 MB (`apps/mail/public/` total ≈ **75 MB**). → **FAIL**.
  - 0 N+1 par ligne sur le chemin inbox / payload liste ≤120 KiB : **non prouvé** (mesure réseau non exécutée ; un N+1 lecture-liste est d'ailleurs référencé au backlog perf du dépôt).
- **Palier 9 — NON acquis** (`performance.md` non prouvé ; budgets JS/latences non mesurés).

## A9 — Robustesse — **3/10**

- **Palier 7 — NON acquis.** `apps/mail/components/mail/mail-list.tsx` (rendu l.961-968) : `isLoading ? <skeleton> : (!items || items.length === 0) ? <EmptyStateIcon> : <liste>`. Le destructuring (l.731) expose `isLoading, isFetching, hasNextPage` **mais pas `isError`** : **un échec de lecture retombe sur l'état vide** — violation directe de « un échec de lecture n'affiche jamais boîte vide ». → **FAIL** sur le chemin inbox.
- **Palier 8,5 — NON acquis** (`robustness.md` : retry borné, idempotence mutations, persistance brouillon, soak 30 min — non prouvés).
- **Acquis partiels** : infrastructure d'états présente ailleurs (skeleton ×48, marqueurs error ×23, stale/offline ×16, empty ×10 dans `components/mail`).

## A10 — Docs, gouvernance & conformité — **2/10**

- **Palier 7 — NON acquis (0/3).**
  - README « stack réelle » : la section *Tech Stack* annonce **Next.js, Node.js, PostgreSQL** — **inexact** (l'app réelle : React Router 7 + Cloudflare Workers/wrangler + Hono/tRPC + Drizzle + Durable Objects). → **FAIL**.
  - `ARCHITECTURE.md` : **absent**. → **FAIL**.
  - `LICENSE-NOTES.md` (inventaire 9 fichiers restrictifs) : **absent**. → **FAIL**.
- **Palier 9,5 — NON acquis.** **0 ADR** ; `FORK.md` **absent** ; posture licence non documentée ; dette non statuée.
- **Acquis partiels** : documentation abondante par ailleurs (specs, checks gelés, jobs, research), sans les artefacts de gouvernance requis.

---

## Tableau de synthèse

| Axe | Intitulé | Note /10 |
|---|---|---|
| A1 | Frontières & modularité | 4 |
| A2 | Type safety | 3 |
| A3 | Tests & vérifiabilité | 2 |
| A4 | CI/CD & gates | 5 |
| A5 | Observabilité & erreurs | 2 |
| A6 | Données, migrations & config | 3 |
| A7 | Sécurité | 7 |
| A8 | Performance structurelle | 2 |
| A9 | Robustesse | 3 |
| A10 | Docs, gouvernance & conformité | 2 |
| **Moyenne** | | **3,3** |

**Verdict** : baseline **NON PASS** (PASS exige moyenne ≥9 ET aucun axe <7 ; ici moyenne 3,3 et 9 axes <7). Seul A7 atteint son palier 7.

### Trois constats les plus marquants
1. **CI sans typecheck ni tests** : `ci.yml` exécute install/audit/agent-surface/build mais aucune étape `tsc` ni `test` ; `pnpm test` racine est un no-op (`@zero/testing` n'a pas de script `test`) ; `tsc --noEmit` révèle 83 erreurs (server) + 135 (mail). Les gates de qualité les plus structurants sont absents.
2. **Observabilité brute** : 465 `console.*` dans `apps/server/src` (budget ≤60), 153 côté mail, aucun Sentry au Worker, `tracing.ts` = stub 9 lignes.
3. **Robustesse et actifs lourds** : la liste inbox fait retomber tout échec de lecture sur l'état vide (pas de branche `isError`), et `public/` embarque 3 GIFs de 10-19 MB (≈75 MB au total).
