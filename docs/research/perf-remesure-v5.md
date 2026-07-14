# Re-mesure intermédiaire — post-V5 étendue niveau9 (2026-07-14)

*Arbre : `f3e20e9d` (fan-in V5 étendue 7/7, dont #44 a8-client). Méthode
B0-comparable identique à `perf-remesure-v4.md`. Worktree dédié, build prod
local, Lighthouse 3 runs médiane.*

## Chiffres (trajectoire complète)

| Métrique | Baseline | Post-V4 | **Post-V5e** | Cible barème |
|---|---|---|---|---|
| Chemin critique gz (shell + inbox) | 499 kB | 377 kB | **302 kB** (263 + 39) | ≤ 250 kB |
| Chunk inbox gz | 128 kB | 101 kB | **39 kB** | — |
| Total JS raw | 5 828 kB | 3 935 kB | 3 978 kB | — |
| LCP landing lab (méd. 3) | 13 701 ms | 5 314 ms | **3 627 ms** | ≤ 2 500 ms |
| FCP landing lab | 4 618 ms | 3 344 ms | **3 477 ms** | — |
| Score LH perf | 0,63 | 0,73 | **0,82** | ~0,90 |
| Landing prerendue | non | coquille vide | **réelle** (héros dans index.html, 102 kB) | ✓ |

## Constat actionnable — prerender invisible (dernier verrou de l'axe 2)

Le HTML prerendu contient bien la landing, MAIS le héros est sérialisé avec
l'état initial de framer-motion :

```html
<h1 ... style="opacity:0;transform:translateY(20px)">AI Powered Email…
```

**Le contenu est présent mais invisible jusqu'à l'hydratation JS** — le FCP
(3,5 s) reste donc calé sur le boot JS, annulant l'essentiel du bénéfice du
prerender. Correctif type : animations d'entrée prerender-safe (état initial
visible + animation CSS, ou `initial={false}` quand le HTML est prerendu, ou
n'animer que les éléments sous le fold). Gain attendu : FCP ≈ coût
HTML+CSS (~0,5-1 s lab) et LCP probablement ≤ 2,5 s (cible atteinte).

## Notes barème provisoires (avant M2)

Axe 1 : ~7 (302 vs 250 ; plancher structurel #44 documenté −15,9 KiB sur leur
métrique) · Axe 2 : ~6,5 (3,6 s ; verrou = prerender invisible ci-dessus) ·
Axes 3/5/6/7 : livrés au code (V4 #30, V5 #34) — vécu à certifier en M2 ·
Axe 8 : probable ~8 (#31) · Axe 9 : chaud ✓, froid : R10 livré dans #44 (à
re-mesurer staging) · Axe 10 : 9-10.

**M2 (certification finale)** : nécessite le déploiement staging de
`f3e20e9d`+ (hard stop — décision explicite Thomas), puis protocoles
B1/M1 : parcours authentifié (liste projetée vécue, ouverture de fil,
sync chronométrée), curl multi-fenêtres avec conditions consignées
(warp/colo), Lighthouse staging.
