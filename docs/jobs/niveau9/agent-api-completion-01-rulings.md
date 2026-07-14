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

## Rulings PHASE 0 (orchestrateur, 2026-07-13)

- **D1 APPROUVÉ** — retrait des 4 outils de mutation hors-whitelist (markThreadsRead/
  Unread, modifyLabels, createLabel) de la surface MCP. Distinction explicite avec le
  précédent #32 : là-bas la capacité était DANS la table gelée (retrait = amputation
  check-vert, refusé) ; ici les capacités sont HORS du whitelist gelé §7 (« create
  draft + reviewable outbox create/inspect/cancel/retry ») — le retrait APPLIQUE le
  contrat de sécurité draft-only gelé. La surface in-app (tools.ts) reste intouchée
  (frontière de confiance distincte). check-agent-surface : extension d'assertions
  couvrant l'absence des 4.
- **D2 APPROUVÉ** — mcp-tools.ts source unique (schémas+descriptions+handlers purs DI)
  consommée par mcp.ts et le dump de schéma : réalisation fidèle de l'Option B #26 vu
  l'incompatibilité de forme SDK MCP vs AI-SDK. Aucune duplication driver/state-machine.
- **D3 APPROUVÉ** — smoke local à dépendances réelles injectées + snapshot tools/list
  reproductible ; la portion session-live reste un blocker documenté, non contourné
  (précédent #28) ; la dette smoke authentifié end-to-end demeure NOMINALEMENT à #40.
- Réécriture listThreads via projection : tue aussi le N+1 MCP et le crash sender
  undefined — consigner les deux au rapport comme bugs corrigés.
