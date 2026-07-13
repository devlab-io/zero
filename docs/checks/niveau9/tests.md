# Check — harnais et couverture de tests (V0.1 test-harness, V5.2 tests-core-coverage)

Executor: bash

## RUN (mécanique — check-runner)
- RUN: `pnpm test` -> exit 0 ; les 3 fichiers hérités apparaissent dans la sortie (V0.1) ; ≥120 tests passants (V5.2)

## V0.1 test-harness
1. `pnpm test` à la racine exécute les tests via turbo et sort 0 ; il découvre et fait passer les
   3 fichiers hérités (queue-view-model, state-machine outbox, mail-sanitize).
2. `vitest.config.*` présent pour apps/mail et apps/server ; tâche `test` déclarée dans
   turbo.json avec caching correct.
3. Les scripts morts de la racine (`test:*`, `eval:ci` pointant vers des cibles inexistantes)
   sont réparés ou supprimés ; `pnpm run` ne référence plus aucun script inexistant.
4. Décision @zero/testing exécutée (réutilisé pour l'e2e ou retiré) ; si retiré, `pnpm install`
   reste vert. `docs/testing.md` explique comment lancer unit et e2e localement.

## V5.2 tests-core-coverage
1. Diff = fichiers `*.test.ts(x)` + fixtures/fakes UNIQUEMENT ; tout fichier produit modifié =
   FAIL (exception : injection d'une couture triviale autorisée par RULING préalable).
2. ≥120 tests passants au total dans le monorepo (`pnpm test` compte affiché).
3. `vitest --coverage` prouve lignes ≥50 % sur : `apps/server/src/lib/driver/` (via fake client
   injecté, zéro appel réseau), `apps/server/src/trpc/routes/mail.ts`, la logique optimiste front
   (reducers/manager/store), la config auth (scopes, cookies), le schéma env.
4. Chaque raccourci du registre clavier a un test de handler (couverture 100 % du registre —
   complète le gate keyboard-parity niveau8).
5. Les tests sont déterministes : 3 runs consécutifs verts (log conservé).
