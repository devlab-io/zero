# Re-mesure intermédiaire — post-vague 4 niveau9 (2026-07-13)

*Arbre mesuré : `88df0b73` (fan-in V4 : w2a #30, w2cd #33, w2f #31, w2e #32 —
tous jugés PASS). Worktree dédié, build prod local, méthode **B0-comparable**
(`docs/research/perf-baseline.md`) : Lighthouse 13.x headless, throttling
simulate mobile, 3 runs médiane ; chemin critique = somme gz -9 des
modulepreload+entry du shell SPA + chunk contenu inbox.*

## Chiffres

| Métrique | Baseline (B0/revue) | Post-P0 (gel w2) | **Post-V4** | Cible barème |
|---|---|---|---|---|
| Chemin critique (shell + inbox) gz | 499 kB | 341 + 128 = 469 kB | **276 + 101 = 377 kB** | ≤ 250 kB |
| Total JS raw | 5 828 kB | 4 183 kB | **3 935 kB** | — |
| LCP landing lab (médiane 3 runs) | 13 701 ms | — | **5 314 ms** | ≤ 2 500 ms |
| FCP landing lab | 4 618 ms | — | **3 344 ms** | — |
| Score Lighthouse perf | 0,63 | — | **0,73** | ~0,90 |
| TBT / CLS | 40 ms / 0,020 | — | **0 ms / 0,000** | — |
| Projection liste (code, checkrun #30) | 20 `mail.get` = 1,8 MB (M1 mesuré) | — | **50 lignes = 1 274 o gzip** | ✓ atteint (à re-mesurer authentifié en M2) |

## Lecture

1. **Axe 3 (liste)** : livré au niveau code — la projection DO remplace le
   double N+1 ; preuve checkrun #30 (1 274 o gzip pour 50 lignes vs 1,8 MB
   mesuré en M1). Confirmation authentifiée en M2, après déploiement staging
   (hard stop deploy = décision Thomas).
2. **Axe 1 (chemin critique)** : 499 → 377 kB gz (−24 %). Reste 127 kB à
   trouver pour la cible ; la gate re-gelée ≤ 420 KiB (leur métrique) vit
   dans #44.
3. **Axe 2 (landing)** : LCP 12,9 s → 5,3 s (−59 %). **Constat actionnable** :
   `prerender: ['/']` est câblé (react-router.config.ts:16, `__spa-fallback.html`
   émis) mais **`index.html` prerendu ne contient PAS le contenu de la landing**
   (héros « AI Powered Email » absent, 8 360 o de squelette) — le contenu
   reste 100 % client (probable guard/lazy non prerender-compatible). Le FCP
   3,3 s est donc toujours du blanc pré-JS. Rendre la landing réellement
   prerendrable est le levier principal restant de l'axe 2.
4. **Méthodo** : #33 mesure « 622,4 KiB critique » via `measure-critical.py` ;
   ma méthode B0-comparable donne 377 kB gz. Définitions différentes (raw vs
   gz, ensembles différents) — la **certification M2 utilisera la méthode du
   barème** (B0-comparable) ; aligner les deux avant #44 si la gate doit
   correspondre au barème.

## Notes barème (provisoires, avant M2)

Axe 1 : 3 → **~6** · Axe 2 : 2 → **~5** · Axe 3 : 2 → **~9 au code** (M2 pour
le vécu) · Axe 8 : ~3 → **probable ~8** (2000→67 round-trips prouvés par
compteur, #31) — mesure de durée réelle en M2 · Axe 10 : **9-10** (mergé,
gardes vertes). Axes 4/5/6/7 : attendent w2b/#34 (V5, en vol) et M2.
