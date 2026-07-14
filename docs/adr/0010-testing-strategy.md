# ADR 0010 — Stratégie de tests + statuts `@zero/testing` et `@zero/cli`

- **Statut :** Accepté
- **Date :** 2026-07-14
- **Issue :** devlab-io/zero#21 (V0.1 test-harness) — statuts confirmés au ruling test-harness-01
- **Périmètre :** organisation des tests du monorepo + statut de deux packages. Documentaire.
- **Lié à :** `docs/testing.md` (procédures détaillées), `ARCHITECTURE.md` §1.

## Contexte

Le check `docs-governance.md` (point 6) demande que la dette soit **statuée** : `@zero/testing`
(réutilisé/retiré, cohérent avec V0.1) et `@zero/cli` (statut documenté). Le harnais de tests a été
posé en V0 et doit être décrit comme décision, pas seulement comme procédure.

## Décision

- **Deux couches de tests** : **unit** (vitest, par app, via turbo — `apps/server` env `node`,
  `apps/mail` env `happy-dom`) et **e2e** (Playwright, dans `packages/testing`). Procédures
  complètes dans `docs/testing.md`.
- **`@zero/testing` — CONSERVÉ pour l'e2e.** Décision approuvée en V0 (ruling test-harness-01 §14,
  cohérente avec le check §V0.1 point 4). L'e2e est **exécuté localement, pas en CI** pour cette
  vague (credentials Gmail hors de portée en CI — AS-5 de #13, cible A3 = 8,5). Entrée :
  `pnpm test:e2e` → `pnpm --filter=@zero/testing test:e2e`.
- **`@zero/cli` — CONSERVÉ, activement consommé.** Le package fournit la CLI `nizzy`, invoquée par le
  script racine `nizzy` (`tsx ./packages/cli/src/cli.ts`) et par `postinstall`
  (`pnpm nizzy sync`). Ce n'est pas de la dette morte : c'est le mécanisme de setup/sync d'env et de
  types documenté dans `README.md` et `AGENT.md`.

## Conséquences

- **+** Un développeur sait quelle couche exécuter, comment, et où (`docs/testing.md`).
- **+** Les deux packages ont un statut explicite : aucun n'est un candidat au retrait.
- **−** L'e2e hors CI signifie qu'une régression e2e n'est pas gardée automatiquement sur PR ; c'est
  un choix assumé pour cette vague (le gate CI reste unit + ratchets + build + dry-run — voir
  `docs/testing.md` §CI).
