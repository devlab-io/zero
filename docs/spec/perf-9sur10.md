# Spec — perf vagues 2-3 : « 9/10 » (run `perf`, extension post-vague 1)

*Extension du run `perf` (tracking devlab-io/zero#7, spec initiale `docs/spec/perf-baseline.md`).*
*Fondations : revue complète `docs/research/revue-perf-ux.md` (+ 5 annexes), baselines B0/B1 `docs/research/perf-baseline.md`.*

## Approval record

Plan approuvé **en session** par Thomas Verdenne le 2026-07-12 via le plan mode
Claude Code (plan « Mega plan performance — Zero Devlab → 9/10 »,
`~/.claude/plans/fais-le-mega-plan-inherited-frog.md`, harness :
« User has approved your plan »). Décisions explicites de Thomas pendant l'intake :

- Périmètre : **perf + fiabilité perçue** (« Perf + fiabilité perçue (Recommandé) ») —
  W2-A, W2-B, W2-C, W2-D, W2-F, W2-H ; clavier (W2-E) et i18n (W2-G) hors plan,
  sauf locales 19→2 (purement perf, rattaché à W2-C).
- Jugement : **« Barème 10 axes mesurés (Recommandé) »** — grille stricte,
  note actuelle honnête, re-mesure M2 de certification.

## Goal

Porter la performance vécue (depuis Tahiti : RTT 150-200 ms, débit réel
44-340 kB/s) à **9/10** sur le barème ci-dessous : moyenne des 10 axes ≥ 9,0
et aucun axe < 8, certifiée par une re-mesure M2 aux protocoles B0/B1.

## Non-goals

- Confiance clavier (W2-E) et i18n des feedbacks (W2-G) — hors périmètre (ruling Thomas).
- Réécriture licence des fichiers `workflows/` — bonus éventuel, pas un objectif.
- Toute modification de `docs/checks/**` par un builder (auto-FAIL).
- `wrangler deploy` — hard stop permanent : confirmation explicite Thomas uniquement.

## Barème — 10 axes mesurables

Notation par axe à M2 : 9 = cible atteinte, 10 = dépassée nettement, sinon
proportionnel à l'écart. Mesures réseau réel en médiane multi-fenêtres (≥ 2
fenêtres espacées — débit Tahiti ×7 variable).

| # | Axe | Mesure actuelle | Note | Cible 9/10 |
|---|---|---|---|---|
| 1 | Premier pixel shell (chemin critique JS) | 499 kB gz (shell 371 + inbox 128) ; FCP lab 4,2-4,5 s ; écran blanc | 3 | ≤ 250 kB gz ; FCP lab ≤ 2,5 s ; fallback < 1 s |
| 2 | Landing `/` (LCP) | LCP lab 12,9 s ; 2 013 kB d'images | 2 | LCP lab ≤ 2,5 s ; images ≤ 300 kB ; prerender HTML |
| 3 | Affichage liste inbox (données) | ~13 `mail.get` complets + sanitisations au 1ᵉʳ rendu, +2/ligne au scroll | 2 | 1 requête `listThreads` projetée ; 0 `mail.get` pour la liste ; LIMIT SQL |
| 4 | Ouverture de fil | Non mesuré (auth requise) | ~4 prov. | ≤ 800 ms perçu à chaud (M1→M2) ; placeholder < 100 ms |
| 5 | Latence perçue des actions | 10 actions optimistes OK ; envoi bloquant | 7 | 100 % optimistes, envoi compris (composer fermé < 100 ms) |
| 6 | Réouverture (cache local-first) | Persist OK mais liste invalidée à restauration | 6 | Liste du cache < 500 ms perçu, revalidation en fond |
| 7 | Fiabilité réseau perçue | `retry:false` global ; échec = « empty » / skeleton infini ; revert silencieux | 2 | Retry backoff lectures ; erreur+retry sur les 13 surfaces ; offline détecté ; 0 état mensonger |
| 8 | Sync Gmail initiale | ~2000 appels sans batch ; backoff plat 60 s ; polling 5 s/page | ~3 prov. | Appels ÷ ~10 ; durée ÷ 3 vs M1 ; backoff exponentiel |
| 9 | TTFB API / cold start | Froid 1,65 s ; chaud 0,6 s ; keep-alive 0,18 s | 5 | Froid ≤ 0,9 s médiane ; keep-alive ≤ 0,2 s conservé |
| 10 | Poids médias & hygiène | GIFs onboarding 48 MB ; icônes PJ 450 kB ; ~9 MB orphelins | 2 | 0 fichier `public/` > 500 kB (hors exception gelée) ; onboarding ≤ 3 MB ; 0 orphelin |

**Note globale actuelle ≈ 3,6 → 4/10** (axes 4 et 8 provisoires, fixés par M1).

## Plan de vagues

- **M1** — mesure authentifiée manuelle avec Thomas (~1 h), protocole
  `docs/spec/perf-m1.md`. Fixe les axes 4 et 8. Parallèle au gel vague 2.
- **Vague 2** (3 issues parallèles, worktrees disjoints) :
  `w2a-lecture-liste` (axes 3, 4, 6) · `w2c-chemin-critique` (axes 1, 2) ·
  `w2d-medias` (axes 2, 10).
- **Vague 3** (après merges vague 2) : `w3b-fiabilite-reseau` (axes 7, 1) ·
  `w3f-serveur-sync` (axes 8, 9) · `w3h-envoi-optimiste` (axe 5).
- **M2** — certification finale, rapport `docs/research/perf-certification.md`.
  En défaut (< 9,0 ou un axe < 8) : vague corrective ciblée + re-certification partielle.

## Validation strategy

Mécanique factory inchangée : checks gelés avant dispatch
(`docs/checks/perf/<slice>.md`), checkrun 100 % RUN pass + judge PASS avant
merge sur `factory/perf`. Re-mesure intermédiaire légère fin de vague 2
(build + gz chemin critique + Lighthouse landing) avant gel vague 3.

## Assumptions

1. Les colonnes `latest_subject`, `latest_sender`, `latest_received_on` du
   SQLite DO suffisent (avec labels + snippet dérivable) à rendre une ligne de
   liste — vérifié dans `routes/agent/db/schema.ts` par la revue serveur.
2. Devlab n'utilise ni PostHog ni Sentry en prod → leur sortie du chemin
   critique est sans perte (les imports dynamiques conditionnels les
   réactivent si clé/DSN présents).
3. Les GIFs d'onboarding pointent vers le CDN upstream `assets.0.email`
   (`components/onboarding.tsx:15-25`) — la vague 2 les localise en `<video>`
   auto-hébergées (dépendance upstream morte = risque).
4. tsc `apps/mail` : baseline 99 erreurs préexistantes (héritée du gel P0) —
   aucun builder n'en ajoute.

## Risques nommés

1. w2a change le contrat `listThreads` client+serveur (couplage max du plan) —
   projection additive, bascule client même commit, judge strict sur le rendu.
2. Licence : `workflows/` (sync, touché en w3f) sous en-tête restrictif
   Zero Email Inc. — usage interne OK, pas de redistribution.
3. Régressions du chemin de lecture — judge-only serve-local systématique
   (landing/login/inbox/fil).
4. Disponibilité Thomas pour M1/M2 — sans session, axes 4 et 8 restent estimés.
5. Prerender `/` + worker assets-only SPA : `index.html` prerendu devient la
   landing ; le fallback SPA des routes profondes doit rester correct
   (`not_found_handling`) — contrainte d'intégration explicite de w2c.
