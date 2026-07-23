# Re-mesure perf — staging post-merge instant-thread (2026-07-24)

*Suite de `perf-certification.md` (13/07, moyenne 6,95/10 NON CERTIFIÉ). Mesure
des correctifs déployés depuis : bc3dab47 (prerender visible, N+1 menu
contextuel, env-schema), PR #54 hotpath (endpoints auth 5,2 s → 1,1 s),
perf/instant-thread (SWR/IDB-first, prefetch voisins, purge caches, traces CF)
+ fix b0545dbd (openThread 500 — voir incident §3).*

## Conditions

| Condition | Valeur |
|---|---|
| Date | 2026-07-24, ~08:30 NZST (poste itinérant — colo **AKL**, pas PPT comme la certif) |
| Réseau | ping 1.1.1.1 moy 15 ms (5 paquets) |
| Arbre | `b0545dbd` (= origin/staging) |
| Workers | `zero-server-staging` redéployé 2× (346ead32 puis b0545dbd), `zero-staging` v `82b93c74` |
| Navigateur | Chrome réel headless via Playwright, **non throttlé** (vs Lighthouse à la certif — méthode différente, tendances comparables, valeurs absolues non strictement) |
| Session | profil Chrome 1 copié en /tmp (login Google manuel de Thomas dans fenêtre pilotée) |

## Mesures

### Landing (axe 2) — médiane 3 runs, contextes frais

| Mesure | Certif 13/07 | 24/07 | Cible |
|---|---|---|---|
| FCP | 6 765 ms (Lighthouse staging) | **616 ms** | ≤ 2,5 s ✓ |
| LCP | 9 040 ms | **616 ms** | ≤ 2,5 s ✓ |
| TTFB doc | — | 161 ms | — |

Héros vérifié visible en clair dans le HTML prerendu déployé (`animate-fade-up`,
4 occurrences ; les `opacity:0` restants sont tous sous le fold — sections
`mt-52`, grille features, CTA final). Le FCP=LCP≈boot JS est mort.

### Inbox authentifiée (axes 3, 6, 9)

| Mesure | Certif 13/07 | 24/07 | Verdict |
|---|---|---|---|
| `mail.get` au 1er rendu liste (client froid) | 15 = 1 215 kB | **0** | N+1 résiduel corrigé ✓ |
| `listThreads` chaud | 5,4–7,9 s | **0,8–2,2 s** | hotpath confirmé, reste > cible 0,2 s |
| Liste servie du cache IDB avant réseau | 2,75 s vécu ✓ | non concluant (9,7 s, mais boot Chrome froid + réveil DO post-deploy polluent ; 0 `mail.get` confirmé) | à re-mesurer au calme |
| TTFB API chaud | 0,04 s | **0,043–0,055 s** | ✓ |
| TTFB API froid isolate | 1,5–1,7 s | 2,1 s | ✗ inchangé (cible ≤ 0,9 s) |

### Ouverture de fil (axe 4) — post-fix b0545dbd

| Mesure | Certif 13/07 | 24/07 | Cible |
|---|---|---|---|
| Chaud (fil déjà ouvert, IDB) | ~1,1–1,5 s | **206 ms** corps affiché | ≤ 800 ms ✓✓ |
| Froid (fil jamais chargé) | 4,19 s | **1,9 s médiane** corps affiché (1,0 / 2,4 / 1,9 s ; `openThread` serveur 0,9–2,1 s) | — |

`mail.openThread` (fil + HTML traité en 1 appel) remplace `mail.get` +
`processEmailContent` séparés ; statut 200 partout.

## Incidents trouvés et corrigés pendant la mesure

1. **P0 — ouverture de fil 100 % cassée sur staging** : le shim de types local
   (`overrides.d.ts`) de a34cf317 avait inventé la signature
   `enterSpan(name, {attributes})` + `handle.end()`. L'API runtime réelle est
   callback-style (`enterSpan(name, (span) => …)`, auto-end, `setAttribute`)
   → chaque `mail.openThread` 500ait (« parameter 2 is not of type Function »),
   y compris via le prefetch survol. **Les tests Node ne l'ont pas vu** (stub
   `tracing: undefined`, feature-check OK des deux côtés). Fix `b0545dbd`
   poussé sur origin/staging, redéployé, vérifié 200. Leçon : un appel live
   minimum est le seul filet pour ce type d'écart shim/runtime.
2. **Build mail sans vars** : build produit dans un worktree sans `.env` →
   `VITE_PUBLIC_APP_URL` absent du bundle → redirection non-auth vers
   `/mail/undefined/login` (404 SPA). Rebuild avec `VITE_PUBLIC_APP_URL` /
   `VITE_PUBLIC_BACKEND_URL` staging inline, redéployé (`82b93c74`).
   **Follow-up** : le build staging dépend de vars non versionnées — ajouter
   un `.env.staging` ou documenter le procédé, sinon rechute garantie.
3. env-schema (incident certif) : boot propre aux deux deploys, plus de 500
   au démarrage ✓.

## Projection barème (axes mesurés 24/07)

| # | Axe | 13/07 | 24/07 | Note proj. |
|---|---|---|---|---|
| 2 | Landing LCP | 4 | LCP 616 ms, prerender visible ✓ | **9** |
| 3 | Liste inbox | 7 | 0 `mail.get` à froid ✓ | **9,5** |
| 4 | Ouverture fil | 5 | chaud 206 ms ✓✓, froid 1,9 s | **8** |
| 6 | Réouverture | 8 | 0 refetch corps confirmé ; timing à re-mesurer | 8 |
| 9 | TTFB / cold | 5,5 | chaud 0,04 s ✓, listThreads 0,8–2,2 s, froid isolate 2,1 s | **6,5** |

Axes 1, 5, 7, 8, 10 non re-mesurés (1 : −49 kB restants ; 8 : durée sync
toujours jamais mesurée). Moyenne projetée en ne retenant que les deltas
prouvés : **~8,1/10** (contre 6,95). Le verrou restant est l'axe 9
(latence serveur authentifiée : `listThreads` > 0,2 s cible, froid isolate)
puis l'axe 1 (chemin critique 298,7 → 250 kB gz).

## Reste à faire (par gain)

1. **Axe 9 — latence serveur auth** : profiler DO→driver→Gmail avec les traces
   natives désormais actives (spans `openThread.getThread`/`sanitize` +
   auto-spans DO/R2/fetch dans le dashboard CF). Cache des corps au niveau DO.
2. **Re-mesure axe 6 au calme** (serveur chaud, Chrome déjà lancé).
3. **Axe 1** : −49 kB gz sur le chemin critique.
4. **Durée réelle sync Gmail** (axe 8) : jamais mesurée, nécessite une
   re-sync décidée par Thomas.
5. `.env.staging` ou doc de build (incident §2).
