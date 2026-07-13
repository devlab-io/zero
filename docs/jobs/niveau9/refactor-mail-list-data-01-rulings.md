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

## RULING 2026-07-13 (addendum, blocker documentaire — verdict critique #26)
- D1 (rapport §Phase 0) : le hook réseau reste consommé UNE fois au niveau de
  l'orchestrateur via useMailListData() ; la row conserve un accès DIRECT léger
  (useThreads du cache) là où instancier un hook réseau PAR LIGNE créerait
  N requêtes/subscriptions par liste — APPROUVÉ explicitement. HÉRITAGE :
  #30 (projection riche) branche la nouvelle forme de données dans
  useMailListData() SANS réintroduire de fetch par ligne ; #34 (états réseau)
  consomme isError/error/isStale déjà exposés par la couture — les deux issues
  héritent de cette décision telle quelle, la row ne redevient jamais un point
  de fetch.
