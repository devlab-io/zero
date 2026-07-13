# Rulings — tests-core-coverage-01 (issue #35)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch — frontières intra-vague V5 (2026-07-13)

1. #35 POSSÈDE les fichiers de tests co-localisés des trois modules optimistes
   (`store/optimistic-updates.test.ts`, `lib/optimistic-actions-manager.test.ts`,
   `hooks/use-optimistic-actions.test.ts`) — #34 ne les crée pas. Les tests s'écrivent
   contre l'état de la factory à la base du job ; si #34 (qui modifie le COMPORTEMENT de
   ces modules) merge en premier, #35 rebase et re-prouve — ne pas anticiper le
   comportement futur de #34.
2. Les tests MCP appartiennent à #36 (dans son may-touch) : #35 n'écrit AUCUN test sous
   `routes/agent/`. Sa cible serveur = `lib/driver/` (fake client injecté),
   `trpc/routes/mail.ts`, config auth, schéma env.
3. `keyboard-parity`/raccourcis : couverture déjà livrée par #32 (11 tests plein-tableau)
   — hors périmètre #35, ne pas dupliquer.
