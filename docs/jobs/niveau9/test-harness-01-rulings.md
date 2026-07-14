# Rulings — niveau9/test-harness-01 (issue #16) — append-only, orchestrateur

## RULING 2026-07-13 — PHASE 0 / concerns du rapport

1. **Périmètre de jugement** : cette slice est jugée contre `docs/checks/niveau9/tests.md`
   **§V0.1 uniquement**. La ligne RUN du check fusionne V0.1 et V5.2 par économie de fichier ;
   l'attente « ≥120 tests passants » s'applique au jugement de l'issue #35 (V5.2), pas ici.
   Pour cette slice, l'attente de la ligne RUN est : exit 0 + les 3 fichiers hérités dans la
   sortie. Aucun affaiblissement de gate : le seuil 120 reste dû par #35.
2. **Environnement mail = happy-dom** : approuvé (base V5.2, version épinglée par overrides).
3. **Suppression de `test:coverage`/`test:ui`/`test:watch`** : approuvée — le re-câblage exige
   les deps coverage/ui qui appartiennent à #35 ; #35 recréera les points d'entrée dont il a
   besoin. `test:ai`/`eval:ci` morts : suppression approuvée.
4. **`@zero/testing` conservé pour l'e2e** : approuvé — cohérent avec le check (§V0.1 point 4)
   et évite la destruction de 5 specs réelles. Le statut sera documenté par #39 (A10).
