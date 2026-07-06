# Spec — Run perf, chantier 0 : baseline mesurée

*Run : `perf` · Orchestration : architect · Précédent : run `tartine` (mergé staging e7ca6f4d).*
*Source : `docs/runs/tartine/plan.md` §RUN 2 + `docs/research/zero-extraordinaire.md`.*

## Goal

Produire `docs/research/perf-baseline.md` : le goulot réel, chiffré, mesuré sur
build de production — pour que les issues P1-P6 du run perf soient figées sur
des faits, pas des intuitions. Sans baseline, pas de décomposition perf.

## Non-goals

- Aucune optimisation dans ce chantier (pas de P1-P6).
- Pas de migration d'hébergeur : l'app est CF-native (DO, Hyperdrive, R2) ;
  re-architecturer pour un autre runtime serait un run à part entière.
- Pas de tuning sync Gmail ici (P5 le couvrira).

## Décisions & assumptions

- **Cible staging : Cloudflare Workers** — RULING (auto, 5m silence,
  2026-07-06) : seule option mesurant la vraie stack (DO/Hyperdrive/R2
  n'existent pas ailleurs) ; Railway aurait inversé mesure et architecture.
  Veto possible après coup.
- **A1** : mesures réseau exécutées depuis Tahiti (poste de Thomas) — les
  benchs publics US/EU ne couvrent pas notre latence réelle.
- **A2** : le compte Cloudflare et les secrets (Google OAuth, DB, R2) sont
  fournis par Thomas au moment du déploiement ; jamais stockés en clair.
- **A3** : une phase B0 locale (build prod servi localement) précède le
  déploiement — signal partiel immédiat, non gaté.

## Validation strategy

- B0 (local, non gaté) : `pnpm build` + serve prod local ; Lighthouse
  (LCP/TBT/CLS), temps d'ouverture de fil sur données seed. Livrable :
  section « B0 — local » du rapport.
- B1 (staging CF, gaté par hard stop déploiement) : Lighthouse depuis Tahiti,
  latence sync initiale, ouverture de fil réel, Hyperdrive froid/chaud,
  R2 sur payloads de threads réels. Livrable : rapport complet.
- Chaque mesure : 3 runs minimum, médiane retenue, conditions notées
  (heure, réseau, cache).

## Hard stops spécifiques

1. **`wrangler deploy` (staging CF) : uniquement sur confirmation explicite
   in-session de Thomas.** Le timer-silence ne vaut jamais autorisation de
   déployer (garde-fou utilisateur prioritaire).
2. Manipulation de secrets : fournis par Thomas, via `wrangler secret put` /
   dashboard — jamais commités, jamais loggés.

## Domain language

- **Baseline** : ensemble de mesures médianes datées sur build prod, avant
  toute optimisation.
- **B0 / B1** : baseline locale / baseline staging déployée.
- **Goulot** : la métrique dominante qui ordonne P1-P6.

## Approval record

- 2026-07-06 — APPROVE (auto, 5m silence) : demande présentée in-session (options 1-3, recommandation APPROVE) et sur devlab-io/zero#7 ; aucun retour au timer ni en commentaire. Porte sur le PLAN seul ; le déploiement staging reste gaté par confirmation explicite (hard stop n°1). Veto possible a posteriori.
