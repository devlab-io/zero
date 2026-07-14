# Job report — perf / b1-staging-baseline (builder 01)

MIRROR: ORCHESTRATOR

## PHASE 0 — plan + vérifications

- **Input verification** : `git rev-parse HEAD` → `e7ca6f4df862c1db7b51f96b401edd7d45b59114` (mauvaise branche, caveat worktree connu). Dérogation pré-autorisée appliquée : `git checkout --detach e1aaeedf443aefac83b643e63d7fc91854d2f9e5` → re-vérifié `e1aaeedf…` (tip `factory/perf`, « checks(perf): freeze b1-staging-baseline »). Lu : `docs/checks/perf/b1-staging-baseline.md`, `docs/spec/perf-baseline.md`, `docs/research/perf-baseline.md` (section B0), `docs/runs/tartine/plan.md` §RUN 2.
- **Plan** : (1) hit API à froid EN PREMIER (avant tout ce qui réchauffe), puis 5 chauds ; (2) découverte assets via HTML servi + manifest ; (3) Lighthouse ×3 sur `/` puis `/login` (fenêtres d'idle API entre les deux pour les échantillons froids 2-4) ; (4) timing du plus gros chunk JS ×9 ; (5) sync initiale et parcours authentifié traités honnêtement (réservé / BLOCKED) ; (6) extension du rapport, checks, rapport de job.
- **Désaccords / découvertes de PHASE 0** :
  - **WARP actif sur le poste** (`warp=on`, colo SYD via `/cdn-cgi/trace`). Non désactivé — toucher à la config réseau de Thomas dépasse mon mandat de mesure ; consigné comme condition (c'est d'ailleurs le vécu réel du poste). Toutes les mesures traversent le tunnel.
  - **`/api/public/providers` ne touche PAS Hyperdrive** (lecture seule de `apps/server/src/routes/auth.ts:7-50` : uniquement des env vars). Le « cold vs warm » demandé mesure l'init d'isolate Worker, pas le pool Hyperdrive. Dit tel quel dans le rapport ; Hyperdrive réel marqué BLOCKED partiel. Aucun endpoint public ne traverse DB/DO/R2 → pas de proxy honnête possible.
  - Un échantillon froid intermédiaire (« COLD-3 » 18:34:17) a été invalidé par moi-même : idle ~30 s seulement (je venais de toucher l'API pour lire le payload). Remplacé par COLD-3bis (90 s) et COLD-4 (120 s) pris en tâche de fond.

## Mesures + conditions

Conditions complètes dans `docs/research/perf-baseline.md` §B1 (2026-07-05 18:29–18:40 UTC-10, Tahiti, WARP→SYD, RTT lien 119–183 ms, Lighthouse 13.4.0 `--headless=new` throttling simulate identique B0, curl 8.19.0).

Synthèse des médianes :

| Mesure | Médiane B1 | Runs |
|---|---|---|
| Lighthouse `/` LCP / FCP / TBT / CLS | 12 940 ms / 4 244 ms / 164 ms / 0,044 | 3 |
| Lighthouse `/login` LCP / FCP / TBT / CLS | 6 199 ms / 4 464 ms / 0 ms / 0,004 | 3 (vrai formulaire vérifié par screenshot, ≠ B0) |
| API TTFB froid (idle >60 s, nouvelle conn) | 1,650 s (3/4 hits ~1,63–1,74 s ; 1 hit resté chaud 0,646 s — éviction non déterministe) | 4 |
| API TTFB chaud, nouvelle conn | 0,615 s | 10 |
| API TTFB chaud, keep-alive | 0,177 s (≈ RTT pur, traitement serveur <50 ms) | 4 |
| HTML `/` TTFB | 0,598 s | 4 |
| Chunk `use-drafts` (1 408 kB brut / 383 kB zstd, cf-cache HIT) total | 3,53 s (spread 1,12–8,79 s ; débit 44–340 kB/s selon fenêtre) | 9 |
| Sync initiale | réservé — mesuré par l'orchestrateur (aucune donnée dans `docs/jobs/perf/`, pas de credentials DB — volontaire) | — |
| Ouverture de fil authentifiée | BLOCKED partiel : session authentifiée requise — mesure manuelle avec Thomas (OAuth Google seul provider, pas de proxy public honnête) | — |

Conclusion livrée : goulot = **P0 poids client**, confirmé et aggravé par le débit réel Tahiti (44–340 kB/s) ; classement P0 > P1 > P2 > P3 > P5 > P6 > P4, justifié chiffres à l'appui dans le rapport §6.

## Check evidence — tous les `- RUN:` verbatim (bash, racine du worktree, executor: bash)

```
$ grep -c "## B1" docs/research/perf-baseline.md
1
exit=0        # attendu >= 1 — PASS
$ grep -cEi "LCP|TBT|CLS" docs/research/perf-baseline.md
21
exit=0        # attendu >= 6 — PASS
$ grep -ci "hyperdrive" docs/research/perf-baseline.md
9
exit=0        # attendu >= 1 — PASS
$ grep -cEi "sync initiale|initial sync" docs/research/perf-baseline.md
5
exit=0        # attendu >= 1 — PASS
$ grep -cEi "goulot|bottleneck" docs/research/perf-baseline.md
10
exit=0        # attendu >= 2 — PASS
$ grep -cEi "P[1-6]" docs/research/perf-baseline.md
9
exit=0        # attendu >= 1 — PASS
$ git status --porcelain -- apps packages | wc -l
       0
exit=0        # attendu 0 — PASS
```

## Limitations / substitutions

1. **WARP non désactivé** : chiffres réseau = poste réel de Thomas (tunnel CF, egress SYD), pas un visiteur FAI lambda.
2. **« Cold » API = init isolate Worker, pas Hyperdrive** (endpoint public sans DB). Hyperdrive froid/chaud réel : BLOCKED partiel, session requise.
3. **Sync initiale** : réservé — mesuré par l'orchestrateur (pas de credentials Railway PG pour ce job, conforme au mandat).
4. **Parcours authentifié (ouverture de fil)** : BLOCKED partiel — Google OAuth impossible headless sans cookies (interdits) ; aucun proxy non authentifié honnête (aucune route publique ne touche DO/Hyperdrive/R2).
5. Fenêtre de mesure courte (11 min, samedi soir) ; le débit varie d'un facteur 7 entre deux fenêtres à 7 min d'écart — médiane de débit à consolider sur plusieurs heures si besoin.
6. Zéro changement sous `apps/**`/`packages/**` (check 7 = 0), zéro redéploiement, aucun secret lu ni copié. Outputs non commités.

STATUS: DONE — all frozen RUN checks pass locally
