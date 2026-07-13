# Rulings — niveau9/w2e-keyboard-parity-01/-02 (issue #32) — append-only, orchestrateur

## Historique procédural
Job -01 stoppé (violation de séquence : code avant PHASE 0, 2 avertissements
sans ACK — chronologie au rapport §incident). Job -02 : reprise bornée, audit
du snapshot fichier par fichier, séquence respectée.

## RULINGS
- Rulings 3 coupures : version FINALE = construction des 3 (correction
  propriétaire — le retrait « check-vert » refusé). (a) send-and-archive dans
  email-composer.tsx : +35 l. mesurées, exclusivement le feature — DANS
  l enveloppe ; décision extraite pure computeArchiveAfterSend (4 tests).
  (b) pickers l/v : composant autonome + montage thread-display +3 l. (≤10) —
  DANS l enveloppe. (c) g s : Piste 1 retenue avec preuve (searchValue.value
  = q dans use-threads ; même filtre que la palette Is Starred) — pas de
  nouvelle route.
- vitest.config.ts (alias ^@/ régex-borné) : APPROUVÉ — infra-test exigée par
  le check#2, zéro impact produit.
- Smoke authentifié (check #6) : TENTÉ, BLOCKED env documenté avec RC natifs
  (pas de backend/secrets/session dans le sandbox builder ; crash racine
  use-settings PRÉEXISTANT, routé #34). Preuve statique substituée : test de
  couverture 15/15 touches → handler. La preuve smoke AUTHENTIFIÉE est DUE à
  #40 (même famille que la preuve réseau #30) — aucune substitution
  silencieuse, dette nominale consignée.
