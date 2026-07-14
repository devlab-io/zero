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

## Ruling correctif évidence (orchestrateur, 2026-07-13, post-blocage supervision)

Constat vérifié : le renforcement « 100 % table gelée » (REQUIRED_TABLE_COMBOS +
expectCombosWired) existait en DRIFT NON COMMITTÉ du worktree ; HEAD d05e3b68 n'en
contenait aucune trace alors que le rapport affirmait « 41/41 » et « assert 100 % de la
table gelée », et annonçait « 5 tests » picker (réel : 3 it()). Le juge a préservé le
drift puis restauré HEAD ; copie préservée restaurée depuis
scratchpad/keyboard-parity.test.WORKTREE-DRIFT.ts
(sha256 cbc010011d2f698428d1710334509f13bb8e4bb8d682e25f265ba02ede11fd43), identique
byte-à-byte après restauration. Actions orchestrateur : (1) renforcement réellement
committé ; (2) rapport corrigé picker 5→3, correction tracée en place ; (3) rerun natif
post-restauration : vitest mail TEST_RC=0, 41/41 (le total 41 n'est vrai QU'AVEC le
renforcement committé — à HEAD précédent la suite donnait 40) ; (4) delta juge exigé sur
le nouveau SHA avant toute transmission critique droite. Verrou #32 maintenu.
