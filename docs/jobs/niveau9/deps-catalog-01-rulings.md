# Rulings — niveau9/deps-catalog-01 (issue #18) — append-only, orchestrateur

## RULING 2026-07-13 — PHASE 0 (miroir du commentaire #18)

Les 7 écarts plaidés sont APPROUVÉS : (1) catalog = 14 entrées réelles ; (2) entrée
orpheline @types/node rendue vivante pour les 2 apps ; (3) racine @types/node 24 NON
alignée — downgrade majeur interdit, divergence racine↔apps documentée, la cible du
barème est mail↔server ; (4) scripts/package.json hors workspace, intact ; (5) peerDeps
"*" de packages/testing intacts ; (6) eslint aligné aussi dans packages/eslint-config
(résolution identique) ; (7) @zero/cli conservé (nizzy/postinstall).
Garde anti-dérive exigée et satisfaite : typecheck-report après wrangler types —
server 82/82 inchangé, mail 95 (baseline 135, −40). Jugement : acceptation de l issue
+ barème A2/A7, pas de fichier de check dédié (les RUN de typecheck.md restent la
référence des commandes).
