# Rulings — niveau9/refactor-mail-list-data-01 (issue #26) — append-only, orchestrateur

## RULING 2026-07-13
- Module mail-list-thread.tsx à 451 LOC (> cible 400, ≤ limite dure 800) :
  APPROUVÉ — fragmenter la row Thread davantage nuirait à la lisibilité,
  même motif que zero-driver.ts (#22).
- STATUS « PASS » du rapport lu comme COMPLETE (le verdict appartient au juge).
- Contrat acté (consommé par #30 et #34) : hooks/use-mail-list-data.ts —
  interface MailListData + useMailListData() (données, loading/fetching/
  error/stale, pagination) ; hooks/use-mail-selection.ts (sélection).
- Overlay optimiste vérifié par ligne (ruling #30 respecté).
