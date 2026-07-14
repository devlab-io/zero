# Final grading — architecture niveau9

- **Date** : 2026-07-13
- **HEAD SHA** : `c80d4bf415dbd0b8d14e06248f82006beaf10d5e` (branche `job/niveau9/final-grading-01`, arbre fusionné post-#39+#40)
- **Protocole** : juge froid FINAL, relève (le juge précédent est mort en cours d'audit à A7 sans rapport ; reprise de zéro sur cible identique et propre). Barème appliqué : `docs/checks/niveau9/grading-rubric.md`.
- **Arbre** : `git status --porcelain` = vide au démarrage ; HEAD vérifié ; aucun fichier suivi modifié hors cette sortie.
- **Environnement de preuve** : `pnpm install --frozen-lockfile --ignore-scripts` (exit 0), `pnpm --filter @zero/mail exec react-router typegen` (exit 0, paraglide compilé), `pnpm --filter @zero/server types` + `pnpm --filter @zero/mail types` (wrangler, exit 0). Toute commande listée ci-dessous a été exécutée en lecture seule par le juge lui-même.

Paliers binaires : un critère non prouvé = non acquis. Note d'axe = 7 ou 9/palier-cible si le palier est intégralement satisfait ; interpolation à ±0,5 uniquement avec critère manquant/excédentaire précisément listé.

---

## A1 — Frontières & modularité — **8/10**

Commandes gelées exécutées :
- LOC : `find apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts' ! -name '*.test.*' -exec wc -l {} + | sort -rn | head -30`
- Frontière : `grep -rnE "(\.\./)+server/src" apps/mail --include='*.ts' --include='*.tsx'`

- **Palier 7 — ACQUIS.**
  - « 0 fichier src >1200 LOC hors exceptions loc-ratchet justifiées » : **1 seul fichier >1200** = `apps/server/src/lib/driver/microsoft.ts` (1291 LOC), **budgété dans `scripts/checks/loc-ratchet.mjs` (1294) et justifié « ADR: driver Microsoft »**. → **PASS**.
  - Frontière : grep = **0 résultat** (RC=1). → **PASS**. `node scripts/checks/loc-ratchet.mjs` = `cross-app frontier imports = 0 (max 0)` + `loc-ratchet PASSED`.
- **Palier 9 (cible) — NON intégralement acquis (2 manquants précis).**
  - Acquis : **4 fichiers >800 LOC** seulement, tous budgétés (≤6 entrées : microsoft.ts 1294, trpc/routes/mail.ts 879, pipelines.ts 873, mail.tsx 852) — `loc-ratchet PASSED (no regression)`. `@zero/types` présent dans les deps **des 2 apps** (`apps/mail/package.json` + `apps/server/package.json`, `workspace:*`) avec **22 imports réels**. Inventaire de routes committé (`docs/adr/route-inventory-{before,after}.json`) ; `route-inventory.mjs` → **`functionalDuplicates = 0`** + overlap `ai` marqué ADR-justified.
  - **Manquant 1 (−0,5)** : règle ESLint `no-restricted-imports` **définie** (`packages/eslint-config/config.ts:27`) mais **NON active en CI** — `ci.yml` ne lance jamais eslint (`grep eslint .github/workflows` = 0) ; le seul lint CI est `oxlint@1.9.0 --deny-warnings` sur **7 fichiers sécurité** uniquement, et `.oxlintrc.json` **ne contient pas** `no-restricted-imports`. La frontière est garantie en CI par le grep du `loc-ratchet` (FRONTIER_MAX=0), mécanisme distinct de la règle ESLint exigée.
  - **Manquant 2 (−0,5)** : `apps/mail/components/` est **organisé par domaine** (16 dossiers : mail, create, queue, settings, context…) mais **sans aucun `index.ts`/`index.tsx`** de domaine (`find … -name index.ts*` = 0). Le critère « avec index » n'est pas satisfait.
  - Réserve (non pénalisée) : 3 des 4 entrées LOC (mail.ts, pipelines.ts, mail.tsx) n'ont pas de justification individuelle au-delà du suivi #20/#21 ; seul microsoft.ts porte une justification ADR explicite.
- **Note = 7 (palier 7 plein) interpolé à 8,0** : palier 9 acquis moins 2 critères précisément listés (ESLint CI, index de domaines) → 9 − 0,5×2 = **8,0**.

## A2 — Type safety — **8/10**

- **Palier 7 — ACQUIS.**
  - `pnpm --filter @zero/server exec tsc --noEmit` (post-wrangler types) → **RC=0, 0 error TS**.
  - `pnpm --filter @zero/mail exec tsc --noEmit` (post react-router typegen + wrangler types) → **RC=0, 0 error TS**.
  - Étape typecheck **bloquante** en CI : `ci.yml` → « Typecheck — server 0 · mail 0 (bloquants stricts) » = `TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`. → **PASS** (vs baseline 83 server + 135 mail).
- **Palier 9 (cible) — NON intégralement acquis (2 manquants précis).**
  - Acquis : comptage `any` gelé **total = 37 ≤40** ; **mail = 23 ≤25** ; **server = 14 ≤15**. `@ts-nocheck` = **0**. Ratchet en CI : `type-ratchet.mjs` présent dans `ci.yml` (« Type (any) ratchet ») → `type-ratchet PASSED` (mail 23/23, server 14/15, total 37/38).
  - **Manquant 1 (−0,5)** : **non-null assertions ≫10**. Comptage (`[A-Za-z0-9_)\]]!` postfixe, hors `!=`) = **84** occurrences (conservateur ≥38) ; concentrations : `ui/toast.tsx` 11, `mail/data.tsx` 8, `routes/autumn.ts` 7, `ui/ai-sidebar.tsx` 7. Cible ≤10 **non atteinte** de loin.
  - **Manquant 2 (−0,5)** : **`@ts-expect-error` non gouvernés par le ratchet**. 4 occurrences (`entry.server.tsx` react-dom ESM, `page-header.tsx` ×2 « fix types », `editor-autocomplete.ts` tiptap/prosemirror). Le spec exige « @ts-expect-error budgétés par RULING, comptés par ratchet » ; or `type-ratchet.mjs` ne compte **que `any`** — aucun gate n'énumère/budgète ces 4 par RULING. Les commentaires renvoient à de vrais trous de typings de libs (pré-existants, « 0 ajouté » selon jobs), mais le critère « 0 non budgété par RULING » n'est pas prouvé par un mécanisme actif.
  - `@ts-ignore` = 1 (`grep` = 1, hors périmètre strict des critères listés).
- **Note = 7 (palier 7 plein) interpolé à 8,0** : palier 9 acquis (any + ratchet CI + 0 @ts-nocheck) moins 2 critères précis (non-null ≤10, budget RULING des @ts-expect-error) → 9 − 0,5×2 = **8,0**.

## A3 — Tests & vérifiabilité — **8/10**

- **Palier 7 — ACQUIS.**
  - `pnpm test` (racine, **turbo**) → **RC=0** : `@zero/server` 15 fichiers / **188 tests passés**, `@zero/mail` 23 fichiers / **139 tests passés** = **327 tests passants**.
  - Les **3 fichiers hérités exécutés** : `src/lib/draft-outbox/state-machine.test.ts` (4), `src/lib/mail-sanitize/index.test.ts` (3), `components/queue/queue-view-model.test.ts` (2) — tous ✓ dans le run.
  - Tâche `test` **bloquante en CI** : `ci.yml:55` « Run unit tests » = `pnpm test`. → **PASS**.
- **Palier 8,5 (cible) — NON intégralement acquis (1 manquant précis).**
  - ≥120 tests : **327** ✓. `docs/testing.md` présent et décrit l'e2e **local** (Playwright dans `@zero/testing`, « run locally, not in CI for this wave ») ✓.
  - Couverture `vitest --coverage` (v8) par cible :
    - `trpc/routes/mail.ts` = **94,86 %** lignes ✓
    - logique optimiste : `hooks/use-optimistic-actions.ts` **89,42 %**, `store/optimistic-updates.ts` **100 %**, `lib/optimistic-recovery.ts` **100 %** ✓
    - config auth : `lib/auth-providers.ts` = **94,33 %** ✓
    - schéma env : `env-schema.ts` = **100 %** ✓
    - registre de raccourcis : `components/context/command-registry.ts` = **100 %** ✓ ; le test `keyboard-parity.test.ts` itère **tous** les `keyboardShortcuts` et exige que chacun résolve vers un handler (`expect(unresolved).toEqual([])`, 11 tests) → « 100 % des raccourcis annoncés » ✓
    - **Manquant (−0,5)** : **`lib/driver` (dossier) = 13,4 % lignes** < 50 %. Le fake client (`__fixtures__/google-http-fake.ts` 100 %) et les méthodes exercées (`gmail-backoff` 95,9 %, `gmail-batch` 96,7 %, `gmail-sync-persist` 100 %, `google-transport` 90,5 %) sont couverts, mais **`microsoft.ts` (1291 LOC) = 0 %** et `google-drafts/labels/messages/parse/threads` (~1480 LOC) = 0 % tirent le dossier sous le seuil.
  - **Palier 9** : e2e en CI **absent** — assumé hors de portée (**AS-5**, testing.md « not in CI for this wave »). Non pénalisé.
- **Note = cible 8,5 − 0,5 (couverture `lib/driver` folder < 50 %) = 8,0.**

## A4 — CI/CD & gates — **9/10**

Fichier `.github/workflows/ci.yml` (`quality-and-security`, PR + push staging, `timeout-minutes: 20`).

- **Palier 7 — ACQUIS (6/6).**
  - frozen install (l.40) ✓ ; typecheck **bloquant** (l.52-53, `TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`) ✓ ; tests bloquants (l.55-56, `pnpm test`) ✓ ; `pnpm audit --prod --audit-level critical` (l.81-82) ✓ ; `check-agent-surface.mjs` (l.84-85) ✓ ; build mail (l.97-98) ✓.
- **Palier 9,5 (cible) — NON intégralement acquis (1 manquant précis).**
  - `wrangler types` **avant** typecheck (l.44-48 puis l.52) ✓.
  - lint **épinglé même version hook/CI** : CI = `oxlint@1.9.0` (l.60) ; hook `.husky/pre-commit` = `lint-staged@17.0.8` → config `package.json` `lint-staged` = `oxlint@1.9.0 --deny-warnings`. **Parité 1.9.0** ✓ (vs baseline hook 1.9.0 / CI @latest).
  - **lint-staged réellement branché** : hook lance `lint-staged`, config présente et active ✓ (vs baseline hook lançait oxlint directement).
  - gitleaks (l.90-95, image épinglée v8.30.1, `--exit-code 1`) ✓ ; dry-run wrangler **×2 apps** (server l.100-103, mail l.105-108) ✓ ; ratchets **LOC/types/console** (l.69-76) ✓ ; check migrations (`migrations-consistency.mjs`, l.78-79) ✓.
  - **gate deploy** : `deploy-to-prod-command.yml:29-44` « Require green CI on staging before deploy » interroge la conclusion CI (`gh api …/ci.yml/runs`) et **`exit 1` si ≠ success** AVANT le `git push --force-with-lease origin main` (l.67). → **plus de force-push sans gate** ✓ (vs baseline force-push non gaté).
  - **Manquant (−0,5)** : **« durée <15 min » non prouvé**. Le `timeout-minutes` est **20** (pas <15) et je ne peux pas exécuter le pipeline GitHub Actions complet (gitleaks docker + build + 2 dry-runs) pour mesurer la durée réelle. Critère non démontré.
- **Note = cible 9,5 − 0,5 (durée <15 min non prouvée) = 9,0.**

## A5 — Observabilité & erreurs — **8/10**

Commandes gelées :
- serveur : `grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l` = **8**
- front : `grep -rE "console\." apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store --include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l` = **121**

- **Palier 7 — ACQUIS.**
  - serveur **8 ≤60** ✓ (vs baseline 465). 0 catch strictement vide (`grep -E "catch\s*\([^)]*\)\s*\{\s*\}"` = **0**) ✓. Sentry actif côté Worker : `lib/sentry.ts` (client envelope Sentry, init depuis `SENTRY_DSN`) + `captureServerException` importé dans `main.ts:20` et câblé comme **request wrapper** du fetch handler (confirmé par `logger.ts:9` « captured by the Sentry request wrapper in main.ts ») ✓.
- **Palier 8,5 (cible) — NON intégralement acquis (1 manquant précis).**
  - serveur **8 ≤20** ✓ ; ratchet CI présent (`console-ratchet.mjs` dans `ci.yml`, `console-ratchet PASSED` server 8/8 front 121/143) ✓.
  - **inventaire catch-swallow à zéro** ✓ : sur 150 `catch` serveur, 12 flaggés par heuristique keyword ; **spot-check des 12 = 0 swallow réel** — tous gèrent avec contexte : `trpc.ts:113`/`index.ts:123` complètent un span `success:false`+reason+message, `outbox.ts:119` → `toMutationError(error)` (typé), `pipelines.effect.ts:94` → `log(...)` avec contexte, `sequential-thinking.ts:143` → retour typé avec `error.message`.
  - **taxonomie d'erreurs tRPC/Hono centralisée et testée** ✓ : `apps/server/src/lib/errors.ts` (5 KB) + `errors.test.ts` (6 tests, couverture 87 % lignes) + **ADR 0008 error-taxonomy**.
  - **tracing.ts statué par ADR** ✓ : `lib/tracing.ts` (952 o, plus le stub 9 lignes) statué par **ADR 0003 tracing-strategy** (façade OpenTelemetry conservée, `createSpan` mort supprimé, `initTracing` vivant avec 4 callers).
  - **Manquant (−0,5)** : **front console = 121 > 40**. Le budget ratchet (143) est tenu, mais la cible palier 8,5 « front ≤40 » n'est pas atteinte (3× le seuil).
- **Note = cible 8,5 − 0,5 (front console 121>40) = 8,0.**

## A6 — Données, migrations & config — **9/10**

- **Palier 7 — ACQUIS (avec 2 tensions littérales documentées, cf. écarts).**
  - « journal == disque, 0 orphelin » : `migrations-consistency.mjs` = `42 sql, 39 journalled, 3 orphan(s), 4 duplicate-prefix group(s)` → **3 orphelins littéraux**, MAIS **tous documentés** dans `migrations-allowlist.json` avec anchors résolus vers `docs/solutions/migrations-drift.md` ; le check **PASSE** (`drift within documented allowlist`). La drift est **permanente par la règle d'immutabilité** (« jamais supprimer/renuméroter une migration appliquée ») — que le palier 9,5 récompense sous « divergences documentées ». → substantiellement acquis (0 orphelin *non documenté*).
  - « env validé par zod au boot » : **serveur ✓** — `env.ts` expose `bootEnv()` qui appelle `assertServerEnv` (schéma zod dans `env-schema.ts`), invoqué à **3 entrées** (`main.ts:32/47/182` : fetch/queue/scheduled), échec lisible (throw citant la clé + `.dev.vars`, testé par `env-schema.boot.test.ts` 23 tests + `env-schema.test.ts` 5). **Worker mail : PAS de validation zod** — mais `workers/spa-fallback.ts` n'a qu'un binding `ASSETS` (aucun secret), donc rien à valider (cf. écart).
- **Palier 9,5 (cible) — substantiellement acquis.**
  - check `migrations-consistency` en **CI** (`ci.yml:78`) ✓.
  - préfixes : 4 groupes dupliqués (0025/0029/0032/0035) **tous documentés** dans l'allowlist avec anchors ✓.
  - « jamais renuméroter une migration appliquée » : `git log --diff-filter=M -- 'migrations/*.sql'` = **0 fichier existant modifié** (diff SQL des migrations existantes = vide) ✓.
  - 2ᵉ config drizzle (`routes/agent/db/drizzle`) **statuée par ADR 0001** (second-drizzle-config-durable-objects-sqlite) ✓.
  - `.dev.vars.example` présent et à jour : `apps/server/.dev.vars.example` (71 clés, incl. DATABASE_URL / BETTER_AUTH_SECRET / GOOGLE_CLIENT_ID / SENTRY_DSN) ✓.
  - `db:push` gardé prod : `db:push` = `node scripts/db-push-guard.mjs && drizzle-kit push` ; le guard **refuse (exit 1)** tout host non-local/non-staging ✓.
- **Manquant précis (−0,5)** : critère palier 7 « env validé par zod au boot des **2 workers** » non démontré pour le worker mail (aucune validation zod ; env réduit à `{ASSETS}`, validation vacante mais littéralement absente).
- **Note = cible 9,5 − 0,5 (boot zod du 2ᵉ worker non démontré) = 9,0.**

## A7 — Sécurité — **8,5/10**

- **Palier 7 — ACQUIS (3/3).**
  - `pnpm audit --prod --audit-level critical` → **RC=0, 0 critical** (14 low / 64 moderate / 48 high) ✓.
  - `node scripts/security/check-agent-surface.mjs` → **RC=0** : « least scopes, bounded session cache, draft-only MCP » ✓.
  - Scopes : `mail.google.com` **absent du runtime** (seule occurrence = commentaire `google-scopes.ts:5` « intentionally excluded ») ✓.
- **Palier 9 (cible) — NON intégralement acquis (1 défaut précis : hygiène gitleaks).**
  - **Triage 100 % high+moderate** ✓ : cross-check reproduit — `pnpm audit --prod --json` = **93 GHSA distincts high+moderate**, **tous présents** dans `docs/research/niveau9/audit-triage.md` (0 manquant ; le doc liste 127 GHSA, surensemble incluant low/clos). Chaque entrée porte package/path/reachability/mitigation/owner (table §2 + détail §3). ✓
  - `security.md` : scopes ✓, audit triage ✓, auth compile (`tsc`=0) et tests auth passent (`auth-providers.test.ts` 7 tests, 94,3 % couv.) ✓. **Réserve** : condition « targeted source scan finds no credential-like additions in the branch diff » compromise par le point gitleaks ci-dessous.
  - **DÉFAUT (−0,5) — la CI gitleaks casserait sur HEAD** : `gitleaks dir .` (v8.30.1 = version CI, `--config scripts/checks/gitleaks.toml`) reproduit **2 findings working-tree NON allowlistés** :
    - `apps/server/.dev.vars.example:51` (`PERPLEXITY_API_KEY=""` — placeholder **vide**, faux positif `generic-api-key`)
    - `docs/jobs/niveau9/agent-api-completion-01-checkrun.md:3` (SHAs git `freeze_sha`/`head` pris pour une clé, faux positif)
    Les deux sont **suivis par git** et **non-gitignorés** (`git check-ignore` RC=1). La config n'allowliste que `i18n.lock` (vérif datée 2026-07-12 « all 8 findings in i18n.lock ») ; ces 2 fichiers ont été ajoutés le 2026-07-13 par #39/#40 **après** cette vérif. Le step CI (`gitleaks dir /repo … --exit-code 1`) **retournerait donc exit 1 (RED)** sur cet arbre. Aucun secret réel exposé (faux positifs prouvés), mais le **gate n'est pas vert sur le commit noté**.
  - **Scan historique reproduit** (`gitleaks git .`, 3425 commits) : **6 findings** — 3 de l'ère du run (2026-07-13 : les 2 faux positifs ci-dessus) + **3 hérités upstream** (`env.ts` cloudflare-api-key 2025-08-01, `wrangler.jsonc` cloudflare/perplexity 2025-07/05) documentés comme dette de fork dans le scope du triage. Le scan est réalisé mais **pas propre**.
  - Tests auth re-passés après bumps ✓.
- **Note = palier 7 plein + palier 9 acquis sauf hygiène gitleaks (gate RED sur HEAD, faux positifs non allowlistés) = cible 9 − 0,5 = 8,5.**

## A8 — Performance structurelle — **8/10**

Mesure gelée (amendement RULING #33 v5) : `python3 scripts/checks/measure-critical.py apps/mail` (le manifest RR7 est sous `apps/mail/build/client/assets/` ; l'arg littéral `.` du barème ne le résout pas — cf. écart) après `pnpm --filter @zero/mail build` (RC=0).

- **Palier 7 — ACQUIS.**
  - **aucun GIF >1 MB dans public/** : `find … -iname '*.gif' -size +1M` = **0** (vs baseline 3 GIFs 10-19 MB) ✓.
  - **payload liste ≤120 KiB / 50 lignes** : `projection.test.ts` prouve « 50-row projection payload: raw=17959B **gzip=1274B** (budget 122880B) » ✓ (unit-testé, déterministe).
  - **0 N+1 par ligne** : `buildThreadProjection` sérialise les 50 lignes en **une seule projection** (pas de fetch par ligne) — preuve structurelle serveur via `projection.test.ts` (9 tests). Le network-log navigateur littéral n'est pas rejoué, mais la garantie no-N+1 est prouvée au data-layer. ✓
- **Palier 9 (cible) — NON acquis (budget JS absolu échoue ; 1 critère non prouvé).**
  - **JS critique ≤420 KiB gz — FAIL** : mesure reproduite = **435,9 KiB gz, GATE ≤420 → FAIL (marge −15,9 KiB)**, `CHUNKS >900 KiB raw: NONE (PASS)`. Conforme à l'attendu. **Plancher structurel transféré nommément à #44** (état au transfert 622,4 KiB → 435,9 maintenant) ; libellé honnête obligatoire : **le poids n'est PAS OK** (>420). → budget absolu palier 9 **non satisfait**.
  - **public/ allégé ≥50 MB** ✓ : `du -sh apps/mail/public` = **4,9 MB** (baseline ~75 MB → **−70 MB**).
  - **backoff expo + concurrence bornée testés unit** ✓ : `gmail-backoff.test.ts` (17 tests) couvre `computeBackoffDelayMs` (backoff expo+jitter), `mapWithConcurrency` (concurrence bornée), `withGmailBackoff`, `isRetryableGmailError`.
  - **batch Gmail ≤100/cycle** ✓ : `gmail-batch.ts` borne à 100 (dur Gmail), 50 recommandé, « ⌈2000/50⌉ = 40 POST batch ≤ 100/cycle » ; `gmail-batch.test.ts` (17 tests, `buildBatchBody`/`runBatched`/`assertBatchComplete`).
  - **cold start −1 s mesuré avant/après — NON prouvé** : aucune évidence (`grep cold-start docs/research/niveau9/perf` = 0). Non couvert par la liste BLOCKED du run. → non acquis (−0,5).
  - **latences p75 (10 itér.) + comparatif Shortwave** : **BLOCKED** (latences interactives p75 + Shortwave = AS du run) → non pénalisé. `performance.md` de ce fait non « PASS intégral » (p75 table BLOCKED, JS FAIL).
- **Note = palier 7 plein + interpolation palier 9 sur critères prouvés non-BLOCKED (public −70 MB, backoff/concurrence unit, batch borné, 0 chunk >900 KiB) − JS ≤420 FAIL (−0,5) − cold-start non prouvé (−0,5) = 8,0.**

## A9 — Robustesse — **8,5/10**

- **Palier 7 — ACQUIS (défaut baseline corrigé).**
  - `mail-list.tsx` destructure désormais **`isError`** (l.41) et calcule `viewState = selectMailListState({itemCount, isLoading, isError, isOffline})` (issue #34), rendu en états **distincts** : `loading` (l.202), `error` (l.206, errorTitle/errorDescription), `empty` (l.228). Commentaire l.145 : « a failed read never renders as empty and cached rows survive a failed refresh ». → le défaut baseline (échec de lecture → boîte vide, `isError` non branché) est **corrigé**. Testé : `lib/mail-list-state.test.ts` (6 tests ✓).
  - Preuve runtime non-auth (docs/research/niveau9/visual) : deep-link `/mail/inbox` sans session → 404 propre (ni page blanche ni skeleton infini) ; `/login` sans backend → ErrorBoundary lisible avec récupération.
- **Palier 8,5 (cible) — ACQUIS (hors items BLOCKED-AS).**
  - **retry lectures ≤2 expo+jitter testé unit** ✓ : `lib/query-retry.ts` + `lib/query-retry.test.ts` (6 tests ✓) ; `query-provider.tsx:54` « Reads retry at most twice with capped exponential jitter ».
  - **mutations non rejouées sans idempotence** ✓ : `query-provider.tsx:64` « No retry here on purpose: non-idempotent mutations must not auto-retry » (structural).
  - **brouillon persisté avant unmount/pagehide + restauré** ✓ : `hooks/use-composer-draft-persistence.ts` (flush sur `beforeunload`/pagehide/visibility-hidden/unmount, restauré au mount) ; testé par `lib/draft-storage.test.ts` + `lib/composer-flush.test.ts`.
  - **optimistes réconciliées visibles/rejouables** ✓ : `use-optimistic-actions.test.ts` (dont « chemin d'erreur post-#34 : undo + réconciliation liste + toast.error action Retry »), `optimistic-actions-manager.test.ts` (4), `optimistic-recovery.test.ts` (4), `store/optimistic-updates.test.ts` (6) — tous verts.
  - **soak 30 min + états surfaces authentifiées réelles + idempotence runtime** : **BLOCKED** (soak navigateur + données authentifiées = AS du run) → non pénalisé.
- **Note = cible 8,5 intégralement satisfaite sur les critères prouvables/unit ; seuls les items BLOCKED-AS restent, non pénalisés = 8,5.**

## A10 — Docs, gouvernance & conformité — **9,5/10**

RERUN sur l'arbre fusionné (l'évidence `A10-docs-pre39.txt` = photo pré-#39, écartée ; spot-checks du juge ci-dessous).

- **Palier 7 — ACQUIS (3/3).**
  - **README stack corrigé** : §Tech Stack (l.33-35) = « React Router 7 (SPA) deployed as a Cloudflare Worker », « Backend Cloudflare Workers (Hono + tRPC), Durable Objects, Workflows, Drizzle ORM », storage PostgreSQL via Hyperdrive + DO SQLite + R2 + Vectorize. → stack réelle ✓ (vs baseline « Next.js/Node/PostgreSQL »).
  - **ARCHITECTURE.md existe** (179 l.) et décrit **couches** (§3 server layers), **flux** (§4 Gmail→driver→workflow→DO SQLite→projection→client), **DO** (§3.2, table classe→fichier), **frontières** (§3.1 Hono vs tRPC) ✓.
  - **LICENSE-NOTES.md** inventorie les fichiers restrictifs : **20 fichiers à en-tête Apache+clause** (+2 mentions non-en-tête = 22 correspondances), inventaire numéroté vérifiable. Le barème disait « 9 » — la réalité mesurée par le run est **20** (écart positif, cf. écarts). ✓
- **Palier 9,5 (cible) — ACQUIS.**
  - **ARCHITECTURE.md vérifié EXACT contre le code (spot-checks du juge)** : les **7 classes DO** annoncées correspondent au code — `ZeroDriver`→`routes/agent/zero-driver.ts:63`, `ZeroDB`→`db/durable-objects.ts:177`, `WorkflowRunner`→`pipelines.ts:132`, `ZeroAgent`→`chat-agent.ts:49`, `ZeroMCP`→`mcp.ts:68`, `ShardRegistry`→`shard-registry.ts:33`, `ThreadSyncWorker`→`sync-worker.ts:7`. `ZeroDriver` importe/possède bien `threads` (db/schema). **7/7 exact.** ✓
  - **≥6 ADRs substantiels** : **12 ADRs** (0001-0011). Les 7 sujets requis couverts : routage (0002), types partagés (0004-shared-types), taxonomie erreurs (0008), découpage DO (0007), posture licence (0009), stratégie tests (0010), driver Microsoft (0011). ✓
  - **FORK.md à jour** : fork `devlab-io/zero` de `Mail-0/Zero`, divergences structure/MCP/CI, posture redistribution — référence niveau9 ✓.
  - **posture licence (3 éléments)** ✓ : en-têtes **préservés** (LICENSE-NOTES « règle de préservation ») + **interdiction de redistribution** (FORK.md §48 « PAS de redistribution, PAS de relicensing » + LICENSE-NOTES) + **plan de sortie** (LICENSE-NOTES:5).
  - **dette statuée** ✓ : `@zero/testing` (CONSERVÉ e2e) + `@zero/cli` (statut documenté) dans **ADR 0010** ; driver Microsoft gelé dans **ADR 0011**.
- **Note = cible 9,5 intégralement satisfaite (spot-checks juge inclus) = 9,5.**

---

## Tableau de synthèse — baseline → final

| Axe | Intitulé | Baseline | Final |
|---|---|---|---|
| A1 | Frontières & modularité | 4 | **8,0** |
| A2 | Type safety | 3 | **8,0** |
| A3 | Tests & vérifiabilité | 2 | **8,0** |
| A4 | CI/CD & gates | 5 | **9,0** |
| A5 | Observabilité & erreurs | 2 | **8,0** |
| A6 | Données, migrations & config | 3 | **9,0** |
| A7 | Sécurité | 7 | **8,5** |
| A8 | Performance structurelle | 2 | **8,0** |
| A9 | Robustesse | 3 | **8,5** |
| A10 | Docs, gouvernance & conformité | 2 | **9,5** |
| **Moyenne** | | **3,3** | **8,45** |

## Verdict

**NON PASS.** PASS exige moyenne ≥9 **ET** aucun axe <7. Ici :
- Moyenne = **8,45** < 9 → **barre haute non atteinte**.
- **Aucun axe <7** (plancher = 8,0) → la 2ᵉ condition PASS **est** remplie (vs baseline : 9 axes <7).

Le run transforme 3,3 → **8,45** et remonte spectaculairement le plancher (0 axe <7). L'échec PASS tient **uniquement** à l'exigence de moyenne ≥9 : aucun axe n'atteint le palier-cible plein sur *tous* ses critères, faute d'items encore FAIL/BLOCKED (JS ≤420, latences p75, soak, hygiène gitleaks).

## Écarts au barème constatés

1. **A1 — ESLint `no-restricted-imports` non exécuté en CI** : la règle est définie (`packages/eslint-config/config.ts`) mais la CI ne lance jamais eslint ; la frontière front→serveur est garantie en CI par un **mécanisme distinct** (grep `FRONTIER_MAX=0` du loc-ratchet). Le critère palier-9 littéral « règle ESLint active en CI » n'est donc pas tenu au pied de la lettre, bien que la propriété soit gardée.
2. **A8 — commande gelée `measure-critical.py .` mal argumentée** : avec l'arg littéral `.`, le script cherche `./build/client` et affiche « NO RR7 manifest found » ; le manifest réel est sous `apps/mail/build/client`. La mesure exige `python3 scripts/checks/measure-critical.py apps/mail` (ou un lancement depuis `apps/mail`). La commande gelée du barème devrait pointer `apps/mail`.
3. **A10 — « 9 fichiers restrictifs » sous-estimé** : le barème palier-7 attend l'inventaire de 9 fichiers ; la réalité mesurée et documentée (LICENSE-NOTES, posture #39) est **20** en-têtes restrictifs (+2 mentions). Écart **positif** : inventaire plus complet que prévu.
4. **A6 — tensions littérales palier-7 résolues par le palier-9,5** : « 0 orphelin » littéral (3 orphelins documentés, permanents par la règle d'immutabilité) est relaxé par la clause palier-9,5 « divergences documentées » + check qui PASSE ; « boot zod des 2 workers » est vacant pour le worker mail (`spa-fallback.ts`, binding `ASSETS` seul, aucun secret) — pénalisé −0,5 par prudence littérale.
5. **A7 — hygiène gitleaks (défaut d'état, pas de barème)** : la config n'allowliste que `i18n.lock` ; 2 faux positifs introduits par #39/#40 **après** la vérif du 12-07 casseraient le step CI (`--exit-code 1`) sur HEAD. Aucun secret réel ; correctif = une entrée d'allowlist.

## Provenance / reproductibilité

Toutes les commandes (audit, tsc, tests, coverage, ratchets, measure-critical, gitleaks git+dir, migrations-consistency) ont été **exécutées par le juge** sur l'arbre `c80d4bf4` après `pnpm install --frozen-lockfile` + génération des types wrangler/react-router + build mail. Les évidences `docs/research/niveau9/` ont servi d'index, jamais de verdict. `git status --porcelain` reste vide hors artefacts gitignorés (node_modules, build, .react-router) et ce fichier.

---

## Contre-jugement post-correctif gitleaks (append-only)

- **Ancrage** : arbre re-noté = **`70ab6f8eb6f39b5a37faecd0a9c6667cf5854fa6`** (factory HEAD, correctif gitleaks-fix mergé en local ; `git merge-base --is-ancestor` confirme que le commit noté `c80d4bf4` en est l'ancêtre). Checkout détaché dans le worktree final-grading-01. Périmètre borné : **A7 et A4 uniquement** (le finding #1 de la notation).
- **Diff du correctif** (vs `c80d4bf4`, 2 fichiers de code) :
  - `apps/server/.dev.vars.example:51` : marqueur inline `# gitleaks:allow` sur `ANTHROPIC_API_KEY=""` (la ligne **réellement** flaggée — le rapport builder confirme l.51 = ANTHROPIC capturant `GROQ_API_KEY=`, pas PERPLEXITY ; **erratum** : ma notation initiale l'avait étiquetée PERPLEXITY/l.53, la ligne 51 était ANTHROPIC — sans effet sur la substance).
  - `scripts/checks/gitleaks.toml` : nouveau `[[allowlists]]` `regexTarget="line"`, regex `freeze_sha: [0-9a-f]{40}` — scope ultra-étroit (label littéral + 40 hex), ne peut matcher un vrai secret.

### Preuves reproduites par le juge

1. **Commande CI gitleaks EXACTE** (`docker run … ghcr.io/gitleaks/gitleaks:v8.30.1 dir /repo --config /repo/scripts/checks/gitleaks.toml --no-banner --redact --exit-code 1`) sur l'arbre corrigé → **RC=0, « no leaks found »**. Le gate est **VERT**. (`build/` gitignoré, honoré par `gitleaks dir` comme en CI.)
2. **Canary (rejoué par le juge)** : secret factice haute-entropie dans un fichier **non tracké** (hors `i18n.lock`, sans `freeze_sha`, sans `gitleaks:allow`) → **RC=1, « leaks found »** ; après suppression → **RC=0**. ⇒ l'allowlist **n'a rien affaibli** : la détection des vrais secrets reste active. (La clé d'exemple AWS canonique `AKIA…EXAMPLE` n'est pas un canary valide : allowlistée par le ruleset built-in de gitleaks, sans lien avec cette config.)
3. **Scan historique** (`gitleaks git`, 3428 commits) : **6 → 4 findings**. Les **2 faux positifs `…-checkrun.md` du run sont supprimés** par la regex `freeze_sha` (appliquée aussi à l'historique). Restent : 1 faux positif run-era `.dev.vars.example@063fd425` (placeholder vide, working-tree désormais propre ; instance historique immuable par la règle anti-réécriture) + **3 hérités upstream** (env.ts/wrangler.jsonc 2025, dette de fork documentée dans `audit-triage.md`, hors périmètre du gate CI par design).

### Re-notation

- **A7 — Sécurité : 8,5 → 9,0.** Mon unique déduction (`−0,5 : « la CI gitleaks casserait sur HEAD »`) est **levée** — la commande CI exacte retourne RC=0. Les autres critères palier-9 restaient acquis (triage 100 % des 93 GHSA high+moderate inchangé, tests auth verts, `security.md` dont la condition « no credential-like additions » désormais satisfaite). Le canary prouve que le correctif ne troque pas la propreté contre une cécité. → **palier 9 plein = 9,0.**
- **A4 — CI/CD & gates : 9,0 (inchangé).** Ma déduction A4 portait **uniquement** sur « durée <15 min non prouvée » (indépendant de gitleaks), donc pas de changement de note. **Statut « CI verte » re-statué** : le seul step qui aurait viré la CI au rouge sur HEAD était gitleaks ; il passe désormais (RC=0), et tous les autres steps que le juge peut exécuter passent (tsc 0/0, 327 tests, ratchets, audit 0 critical, migrations, build, dry-runs). L'hypothèse « CI verte sur HEAD » est **restaurée** et le gate deploy (exige CI verte) autoriserait donc correctement le déploiement. Intégrité A4 pleinement confirmée ; note maintenue 9,0 (plafonnée par la seule durée non mesurable).

### Nouveau tableau & verdict

| Axe | Notation initiale | Post-correctif |
|---|---|---|
| A1 | 8,0 | 8,0 |
| A2 | 8,0 | 8,0 |
| A3 | 8,0 | 8,0 |
| A4 | 9,0 | 9,0 |
| A5 | 8,0 | 8,0 |
| A6 | 9,0 | 9,0 |
| A7 | 8,5 | **9,0** |
| A8 | 8,0 | 8,0 |
| A9 | 8,5 | 8,5 |
| A10 | 9,5 | 9,5 |
| **Moyenne** | **8,45** | **8,50** |

**Verdict re-statué : NON PASS.** Moyenne = **8,50** < 9 (barre haute non atteinte) ; **aucun axe <7** (plancher 8,0). Le correctif gitleaks lève proprement le défaut A7 (+0,5) et solidifie la posture « CI verte » d'A4, mais ne suffit pas à porter la moyenne à ≥9 : les résidus qui plafonnent le PASS sont désormais **hors gitleaks** (JS critique 435,9>420 sur A8, cold-start non prouvé, non-null assertions A2, couverture `lib/driver` A3, front console A5, latences p75 / soak BLOCKED-AS). Le run reste une remontée 3,3 → 8,50 sans axe faible.
