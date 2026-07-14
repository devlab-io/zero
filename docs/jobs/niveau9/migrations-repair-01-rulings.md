# Rulings — niveau9/migrations-repair-01 (issue #19) — append-only, orchestrateur

## RULING 2026-07-13 — PHASE 0 (miroir du commentaire #19)

- D1 CONFIRMÉ : allowlist NE PEUT PAS être vidée sans violer la règle absolue
  anti-suppression/renumérotation des .sql. Forme licite jugée : RÉDUCTION aux
  7 exceptions durables (3 orphelins + 4 groupes de préfixes), chaque entrée
  liée à sa section de docs/solutions/migrations-drift.md et vérifiée par le
  script (doc-ref résolu). « Vidée » de l objectif est caduc.
- D2 APPROUVÉ : correction du commentaire d en-tête trompeur du script.
- D3 APPROUVÉ : retrait de l entrée journal 0032 dupliquée = correction,
  neutralité prouvée par drizzle-kit generate avant/après.
- Constat acté : 2ᵉ config drizzle = isolation VOULUE (SQLite durable-sqlite
  des Durable Objects vs Postgres), formalisée par ADR ; ses migrations
  s appliquent au runtime via @Migratable, validées structurellement par
  migrations-consistency, pas par generate.
- Handoff CI : le branchement de migrations-consistency dans ci.yml est déjà
  livré par #17 (mergé a8ef30bc) — handoff sans objet.
- Numéro ADR 0001 provisoire : accepté, renumérotation éventuelle par #39.
