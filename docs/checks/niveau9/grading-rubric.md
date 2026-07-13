# Check maître — barème de notation architecture (gelé)

Protocole juge froid : agent orchestrator-tier SANS contexte du run. Entrées autorisées : le repo
au commit indiqué, ce fichier, les checks référencés. Le juge exécute lui-même chaque commande de
preuve (read-only + builds locaux). Il applique les paliers en binaire : un critère non prouvé =
non acquis. Note d'axe = 7 ou 9 si le palier est intégralement satisfait ; interpolation à ±0,5
uniquement si le juge liste précisément le critère manquant/excédentaire. Baseline et final au
même protocole. Artefacts : `docs/runs/niveau9/baseline-grading.md` et `final-grading.md`.

## A1 — Frontières & modularité
- Commandes gelées : LOC = `find apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts' ! -name '*.test.*' -exec wc -l {} + | sort -rn | head -30` ; frontière = `grep -rnE "(\.\./)+server/src" apps/mail --include='*.ts' --include='*.tsx'`.
- Palier 7 : aucun fichier source >1200 LOC hors exceptions listées ET justifiées dans la config `scripts/checks/loc-ratchet` ; commande frontière = 0 résultat.
- Palier 9 : 0 fichier src >800 LOC hors exceptions `loc-ratchet` (≤6 entrées au final, chacune justifiée — `lib/driver/microsoft.ts` couverte par l'ADR driver Microsoft) ; règle ESLint `no-restricted-imports` active en CI ; package `@zero/types` présent dans les deps des 2 apps avec imports réels ; inventaire de routes committé, 0 doublon fonctionnel Hono/tRPC, routes Hono restantes justifiées par ADR ; `apps/mail/components/` organisé par domaine avec index.

## A2 — Type safety
- Palier 7 : `pnpm --filter @zero/mail exec tsc --noEmit` ET `pnpm --filter @zero/server exec tsc --noEmit` = 0 erreur (après génération des types wrangler) ; étape typecheck bloquante dans ci.yml.
- Palier 9 : + `any` ≤40 au comptage gelé `grep -rE ":\s*any\b|as any|<any>|\bany\[\]" apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src --include='*.ts' --include='*.tsx' --exclude='*.d.ts' --exclude='*.test.*' | wc -l` (cibles assignées : mail ≤25, server ≤15) ; 0 `@ts-nocheck` ; non-null assertions ≤10 ; ratchet en CI ; 0 `@ts-expect-error` non budgété par RULING.

## A3 — Tests & vérifiabilité
- Palier 7 : `pnpm test` à la racine exécute réellement les tests (turbo) et passe ; les 3 fichiers de tests hérités sont exécutés ; tâche `test` bloquante en CI.
- Palier 8,5 (cible) : ≥120 tests passants ; couverture prouvée par `vitest --coverage` sur : lib/driver (fake client, méthodes publiques exercées), trpc/routes/mail, logique optimiste (reducers/manager), config auth, schéma env, registre de raccourcis (100 % des raccourcis annoncés ont un test de handler) — lignes ≥50 % sur ces dossiers ; `docs/testing.md` décrit l'e2e local.
- Palier 9 : + e2e en CI (hors de portée assumée — AS-5).

## A4 — CI/CD & gates
- Palier 7 : CI PR exécute frozen install, typecheck bloquant, tests bloquants, `pnpm audit --prod --audit-level critical`, `check-agent-surface.mjs`, build mail.
- Palier 9,5 (cible) : + `wrangler types` avant typecheck ; lint épinglé même version hook/CI ; gitleaks ; dry-run wrangler ×2 apps ; ratchets LOC/types/console ; check migrations ; durée <15 min ; gate deploy : le workflow `/deploy` exige CI verte (plus de force-push sans gate) ; lint-staged réellement branché.

## A5 — Observabilité & erreurs
- Commandes gelées (code produit uniquement — tests et générés exclus) :
  serveur = `grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l` ;
  front = `grep -rE "console\." apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store --include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l`.
- Palier 7 : serveur ≤60 ; 0 catch strictement vide ; Sentry actif côté Worker (init + capture dans le fetch handler).
- Palier 8,5 (cible) : serveur ≤20 / front ≤40 avec ratchet CI ; inventaire des ~30 catch-swallow à zéro (chaque catch loggue avec contexte ou rethrow typé) ; taxonomie d'erreurs tRPC/Hono centralisée et testée ; `tracing.ts` implémenté ou supprimé par ADR.

## A6 — Données, migrations & config
- Palier 7 : journal Drizzle == fichiers disque (0 orphelin) ; env validé par zod au boot des 2 workers avec échec lisible.
- Palier 9,5 (cible) : + check `migrations-consistency` en CI ; préfixes uniques ou divergences documentées ; règle « jamais renuméroter une migration appliquée » respectée (diff SQL des migrations existantes = vide) ; 2ᵉ config drizzle (routes/agent/db) statuée par ADR ; `.dev.vars.example` à jour ; `db:push` gardé contre un usage prod.

## A7 — Sécurité
- Palier 7 : `pnpm audit --prod` 0 critical ; `check-agent-surface.mjs` PASS ; scopes conformes à `google-scopes.ts` (pas de mail.google.com).
- Palier 9 : `docs/checks/niveau8/security.md` PASS intégral, y compris triage 100 % des high+moderate dans `docs/research/niveau9/audit-triage.md` (package/path/reachability/mitigation/owner par entrée) ; gitleaks CI + scan de l'historique de la branche du run ; tests auth re-passés après tout bump.

## A8 — Performance structurelle
- Palier 7 : 0 N+1 par ligne sur le chemin initial inbox (network log : 1 requête liste + ≤1 body) ; payload liste ≤120 KiB compressé / 50 lignes ; aucun GIF >1 MB dans public/.
- Amendement (RULING critique droit #33, 2026-07-13 — re-gel freeze/niveau9-v5) : le gate
  « JS critique ≤420 KiB gz » est transféré NOMMÉMENT à l'issue #44 (a8-client-completion),
  mesure gelée = `python3 scripts/checks/measure-critical.py .` (union modulepreload des
  routes /mail/inbox, état au transfert : 622,4 KiB — libellé honnête obligatoire, jamais
  « poids OK » tant que >420). Le palier A8 final du barème reste dû au jugement final.
- Palier 9 : `docs/checks/niveau8/performance.md` satisfait sur les budgets absolus (JS critique ≤420 KiB gz — porteur nominal #44, latences p75 mesurées 10 itérations) ; batch Gmail ≤100 appels/cycle de sync prouvé par compteur loggé ; concurrence bornée + backoff expo testés unit ; cold start −1 s mesuré avant/après ; public/ allégé d'au moins 50 MB vs baseline. Comparatif Shortwave : BLOCKED ≠ échec (AS du run).

## A9 — Robustesse
- Palier 7 : inbox, recherche, thread, outbox distinguent loading/empty/stale/error ; un échec de lecture n'affiche jamais « boîte vide » ni skeleton infini.
- Palier 8,5 (cible) : `docs/checks/niveau8/robustness.md` PASS intégral : retry lectures ≤2 expo+jitter (testé unit), mutations non rejouées sans idempotence, brouillon persisté avant unmount/pagehide + restauré, optimistes réconciliées visibles/rejouables, soak 30 min sans erreur non gérée (log conservé).

## A10 — Docs, gouvernance & conformité
- Palier 7 : README corrigé (stack réelle) ; ARCHITECTURE.md existe et décrit couches/flux/DO/frontières ; LICENSE-NOTES.md inventorie les 9 fichiers restrictifs.
- Palier 9,5 (cible) : ARCHITECTURE.md vérifié exact contre le code par le juge (spot-checks) ; ≥6 ADRs substantiels (routage, types partagés, taxonomie erreurs, découpage DO, posture licence, stratégie tests, driver Microsoft) ; FORK.md à jour ; posture licence : en-têtes préservés sur modules dérivés + interdiction de redistribution documentée + plan de sortie ; dette statuée (@zero/testing, @zero/cli, driver Microsoft).

## Verdict
Note finale = moyenne des 10 axes. PASS du run : moyenne ≥9 ET aucun axe <7. Le juge rapporte
axe par axe : note, critères acquis/manquants avec évidence (commande + sortie), et la moyenne.
