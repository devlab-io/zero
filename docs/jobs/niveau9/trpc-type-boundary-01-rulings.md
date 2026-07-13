# Rulings — niveau9/trpc-type-boundary-01 (issue #43) — append-only, orchestrateur

## RULING 2026-07-13
- Option (c) retenue par le builder (frontière .d.ts générée + committée,
  générateur déterministe scripts/gen-trpc-boundary.mjs) : ACCEPTÉE — la
  double garde exigée est présente : (1) régénération CI-vérifiable
  (0 diff au regen), (2) drift-test de types (boundary.test-d.ts, maps I/O
  mutuellement assignables au vrai router — toute dérive casse tsc server).
- Piste B (rollup-dts) rejetée par preuve (MCPOptions) : design-it-twice
  satisfait, consigné en ADR 0006.
- auth.boundary minimale : ACCEPTÉE — fidèle, le type Session dérivé est
  inutilisé côté mail (vérifié par le builder, à re-vérifier par le juge).
- Shim dormroom mail retiré (mort après frontière) : conforme au plan de
  réveil de #25.
- Gate v4 : BASELINE.mail 17→0 resserré par le porteur nominal — le SEUL
  autorisé à le faire.
- Base a7dc4463 antérieure aux merges #26/#27 : rebase orchestrateur sur
  cd74186d AVANT jugement (discipline stale, PV #13).
