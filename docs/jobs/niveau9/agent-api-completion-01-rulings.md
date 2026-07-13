# Rulings — agent-api-completion-01 (issue #36)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch — périmètre et voisinage (2026-07-13)

1. `routes/agent/**` t'appartient intégralement cette vague, Y COMPRIS ses sites
   `console.*` : #42 (console-sweep) en est exclu par carve-out. Si tu touches un
   fichier routes/agent, tu peux basculer ses console vers le logger structuré au
   passage (pattern #29), niveau sémantique conservé — mais ce n'est pas ton
   acceptance, ne le fais que sur les fichiers que tu modifies de toute façon.
2. Dette héritée #26 (routing-consolidation) : `mcp.ts` — l'« Option B » retenue est
   l'héritage/composition depuis la surface d'outils consolidée plutôt que la
   duplication des définitions. Vérifie le rulings de #26 avant de planifier.
3. Le contrat de projection (routes/agent/projection.ts, posé par #22/#30) est CONSOMMÉ,
   jamais modifié. La spec du run interdit toute surface send/suppression
   définitive/spam/réglages : c'est testé par check-agent-surface.mjs, que tu peux
   ÉTENDRE (assertions nouvelles) mais jamais affaiblir.
