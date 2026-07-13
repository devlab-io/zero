# Rulings — niveau9/tsc-zero-server-01 (issue #21) — append-only, orchestrateur

## RULING 2026-07-13 — PHASE 0 (reprise post-coupure API)
1. Shim vendor src/vendor/dormroom.d.ts + redirection paths : APPROUVÉ —
   correctif réel (référence globale de dormroom écrasant l Env wrangler,
   26 bindings masqués), types-only, strict intact, 0 exclude. Preuve isolée
   82→42 exigée au rapport et re-vérifiable.
2. Correction amont du type de retour de rawListThreads (routes/agent/index.ts:961) :
   APPROUVÉE.

## RULING 2026-07-13 — AMENDEMENT DE FRONTIÈRE (Option B, mcp.ts)
Contradiction dure : tsc=0 (critère de sortie de vague) vs mcp.ts interdit
(possédé par #36) portant 2 erreurs de baseline dont la cause exposait un
BUG RÉEL (mcp.ts:363 lisait thread.latest, champ inexistant sur un item de
liste — expéditeur undefined à l exécution, masqué par any).
Décision : Option B autorisée, conditions strictes tenues — diff mcp.ts =
1 ligne (l.363 thread.latest → loadedThread.latest) + rien d autre ; aucun
changement de schéma d outil ni des littéraux createDraft/enqueueDraftJob ;
check-agent-surface vert après ; diff verbatim au rapport. L issue #36
(propriétaire de mcp.ts) hérite de cet amendement dans son contexte de dispatch.

## Événements de session
Deux coupures API mi-réponse ; reprise same-session (contexte jeune), état
re-vérifié par git status à chaque reprise. Suppression de 2 blocs de code
mort commenté (markThreads désactivés, config OTEL commentée) pour tenir les
bornes LOC : documentée au rapport, comportement inchangé.
