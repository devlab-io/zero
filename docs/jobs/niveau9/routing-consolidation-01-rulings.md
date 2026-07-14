# Rulings — niveau9/routing-consolidation-01 (issue #24) — append-only, orchestrateur

## RULING 2026-07-13 — arbitrages PHASE finale

- D2 APPROUVÉ : db/durable-objects.ts reste sous db/ — ZeroDB/DbRpcDO sont des
  DO de base de données, pas des routes ; emplacement non possédé par #22/#23,
  ré-exports depuis main.ts préservant bindings/wrangler (diff vide vérifié).
- F1 RÉSOLU EN AMONT : les deux entrées loc-ratchet rouges (contributors 1040,
  palette 1922) ont été re-snapshotées par commit orchestrateur 13911b6b
  (ruling #13/#23) — le jugement se fait sur branche REBASÉE sur factory,
  où le ratchet est vert.
- Suppression chat.ts (1610 LOC) : acceptée SOUS RÉSERVE de la vérification
  juge renforcée — 0 référence repo-wide (imports, wrangler bindings, classes
  ZeroAgent/ZeroMCP anciennes), aucun en-tête licence retiré. Le fichier
  était le doublon mort dont #22 porte les descendants vivants (routes/agent).
- Collision de namespace ai.ts vs trpc/ai actée comme NON-doublon (téléphonie
  X-Voice-Secret vs session) — consigné à l ADR routing.
- Note : l ADR du builder porte le numéro 0001 déjà pris (ADR drizzle #19) —
  renuméroté 0002 par l orchestrateur au commit, contenu inchangé.
