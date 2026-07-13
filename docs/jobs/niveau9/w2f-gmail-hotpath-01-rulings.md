# Rulings — niveau9/w2f-gmail-hotpath-01 (issue #31) — append-only, orchestrateur

## RULING 2026-07-13 (reprise post-refus — 5 exigences)
- #4 env natif : satisfait (symlink purgé, install frozen frais, tsc 0 natif).
- #1/#3a : routage du vrai sync par le moteur batch VIA sync-threads-workflow
  (territoire possédé) ACCEPTÉ — le juge scrute l ÉQUIVALENCE de la
  réplication R2+storeThreadInDB vs ThreadSyncWorker (clés, sémantique) et
  la vivacité des deux chemins (pas de double-écriture ni chemin mort).
- #2 sous-réponses : assertBatchComplete (complet ou GmailBatchError nommé)
  — sémantique sans perte exigée, 6 tests à re-exécuter par le juge.
- #3c : 60s plat retiré du chemin possédé ; gmail-rate-limit.ts (hors bornes)
  consigné pour l issue de complétion A8.
- #5 createAuth : MÉMOÏSATION ANNULÉE — finding VALIDÉ (better-auth capture
  une connexion postgres-js à la construction ; Workers interdit le socket
  cross-request). Per-requête = contrat correct. Le point 5 du refus visait
  exactement ce risque : résolu par annulation documentée in-code.
- #3b lazy-IA : BLOCKED MOTIVÉ ACCEPTÉ — harnais R10 exécuté (médiane
  289 ms), grep frais 0 import IA dans le territoire, delta structurellement
  nul depuis sa frontière. Le levier −1 s (routes/agent/trpc-ai) est ROUTÉ
  vers l issue de complétion A8 (fan-in vague 4). Offre de « patch
  #30-ready » DÉCLINÉE — discipline de propriété.
- eslint auth.ts:42 (react as any) : préexistant hors diff, non imputable.
