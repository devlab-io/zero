# Rulings — Vague V7 « niveau réel » (post-notation 8,45, arbitrage propriétaire 2026-07-13)

Fichier append-only, propriété orchestrateur. Cadre de la vague : poursuivre les GAINS
RÉELS en LOCAL (aucun push/PR/deploy sans feu vert propriétaire). Principes opposables :
- Le niveau réel prime sur le 9,00 arithmétique. Aucune chasse cosmétique.
- A1 : pas de barrels inutilisés pour le score — les index doivent porter une VRAIE
  frontière et être CONSOMMÉS, sinon le critère est documenté comme cosmétique.
- A4 : reste BLOCKED/provisoire sans run GitHub réel — simulation locale + baisse de
  timeout si légitime, JAMAIS « durée prouvée ».
- A8 : la mesure gelée NE CHANGE PAS après l'échec constaté. Tentative de réduction
  RÉELLE sous 420 d'abord. Toute évolution du barème = décision PRÉALABLE d'un arbitre
  froid indépendant sur la validité technique de la métrique, ancienne ET nouvelle
  mesures conservées.
- Chaque fan-in de vague = juge froid. Libellé honnête constant.

## Fences V7a (5 jobs parallèles, fichiers disjoints)
- a1-frontier-ci-01 : .github/workflows/ci.yml, config lint (packages/eslint-config,
  .oxlintrc.json), scripts racine si besoin d'un script lint ; INVESTIGATION index de
  domaines (consommés-réels ou documentés-cosmétiques, décision au rapport).
- a5-front-console-01 : sites console.* de apps/mail/{app,components,lib,hooks,store,
  providers} UNIQUEMENT + pattern de destination à proposer en PHASE 0 (ruling avant
  exécution massive).
- a3-driver-coverage-01 : NOUVEAUX tests apps/server/src/lib/driver/**.test.ts +
  __fixtures__ ; AUCUN code produit.
- a6-zod-mail-01 : apps/mail/workers/ uniquement (validation env honnête du worker).
- a8-weight-hunt-01 : INVESTIGATION d'abord (mesures, décomposition chunks, cold-start
  avant/après par worktree jetable) → rapport → ruling orchestrateur avant toute
  exécution de coupe. docs/research en écriture.
V7b (séquencé post-merge a5) : a2-nonnull-01 (84 → ≤10 par guards réels) + extension
type-ratchet @ts-expect-error (budget 4 + RULING nommant les 4 réels).
