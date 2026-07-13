# Rulings — niveau9/ci-and-deploy-gates-01 (issue #17) — append-only, orchestrateur

## RULING 2026-07-13 — décisions PHASE 0 / concerns du rapport

1. **gitleaks en image Docker épinglée** (`ghcr.io/gitleaks/gitleaks:v8.30.1`) au lieu de
   `gitleaks-action@v2` : APPROUVÉ — l'action exige `GITLEAKS_LICENSE` pour une org, or le run
   n'introduit aucun secret nouveau (contrainte du check §4) ; même scanner, MIT, exécutable.
2. **5ᵉ script `typecheck-report.mjs`** (mode rapport + ratchet non croissant + commutateur
   `TYPECHECK_BLOCKING`) : APPROUVÉ — exigé par le comportement du check §1 même si seuls
   4 ratchets étaient nommés ; `type-ratchet.mjs` reste la commande A2.
3. **Frontière A1 gelée à ≤5 dans loc-ratchet** (baseline mesurée, non-croissant) : APPROUVÉ —
   la descente à 0 appartient à #25 (shared-types) qui abaissera la borne à 0 à son merge.
   Aucun affaiblissement : le palier A1 du barème exige toujours 0 au jugement final.
4. **Typecheck en mode rapport** : conforme au check §1 par design — le flip bloquant est une
   action orchestrateur en fin de vague 1 (après #20/#21), via `TYPECHECK_BLOCKING`.
5. **Preuve CI GitHub réelle** : reportée à la PR du run (ruling pré-accordé au dispatch) ;
   le replay local séquentiel 15/15 vert en 65 s (store chaud) vaut preuve de contenu et
   d'ordre des étapes.
