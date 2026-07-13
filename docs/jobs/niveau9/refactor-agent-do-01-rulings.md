# Rulings — niveau9/refactor-agent-do-01 (issue #22) — append-only, orchestrateur

## RULING 2026-07-13 — concerns du rapport

1. loc-ratchet rouge sur contributors.tsx/palette : RÉSOLU EN AMONT par le
   re-snapshot orchestrateur 13911b6b (ruling #13/#23) — jugement sur branche
   REBASÉE, ratchet vert.
2. Cible 400 dépassée sur zero-driver.ts (496) et chat-agent.ts (401) :
   APPROUVÉ — coques de classes DO irréductibles sans casser le contrat RPC ;
   la limite normative de structure.md est 800 (dure), la cible 400 est
   indicative. Consigné pour le juge.
3. Contrat de projection acté (consommé par #30/#36) : projection.ts —
   getThreadsFromDB / getThreadFromDB / searchThreads / inboxRag /
   normalizeFolderName ; mapping sujet←threads.latestSubject,
   expéditeur←threads.latestSender, date←threads.latestReceivedOn,
   labels+non-lu←thread_labels ; PAS de snippet (ruling #30).
4. Rulings #21 vérifiés préservés : rawListThreads sérialisable verbatim,
   getThreadFromDB peuple .latest (mcp.ts:363 valide).
