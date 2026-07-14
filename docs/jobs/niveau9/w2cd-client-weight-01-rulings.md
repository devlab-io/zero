# Rulings — niveau9/w2cd-client-weight-01 (issue #33) — append-only, orchestrateur

## RULING 2026-07-13 (round 2 — refus supervision intégré)
1. Gate JS 420 : multi-jobs ACTÉ — ventilation chiffrée acceptée (rows 103 KB
   → #30 ; palette 23 KB → #32 ; posthog 57,6 KB → #34 ; motion 41,6 KB via
   thread-display → SANS OWNER, routage orchestrateur : issue de complétion
   A8-client à créer). Somme évincable 225,2 KB → 397,2 < 420 : gate
   atteignable en équipe. STATUS COMPLETE_WITH_CONCERNS conforme.
2. Delta public propre = 1,2 MB consigné sans crédit du cumul amont : conforme.
3. Landing prérendue : BLOCKED out-of-boundary ACCEPTÉ — preuve par expérience
   réversible (clientLoader auth-redirect de app/page.tsx force le fallback ;
   retiré → index.html 101,7 KB avec le vrai HomeContent ; restauré, git 0).
   Reste-à-faire owner consigné (sortir l auth-redirect du clientLoader +
   shell neutre dédié pour not_found) — candidate l issue de complétion A8.
   Le finding gelé wrangler↔artefact reste satisfait et prouvé.
4. Bug AnimatedNumber : corrigé, logique extraite pure (clock injectable),
   preuve rouge-avant citée (expected 5.94 >= 87.5) — sous réserve du juge.
