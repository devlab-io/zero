# Job report — perf/b0-local-baseline (attempt 01)

MIRROR: ORCHESTRATOR

## PHASE 0 — plan de mesure + vérification des entrées

Input verification (après ruling orchestrateur, `docs/jobs/perf/b0-local-baseline-rulings.md` / issue #8) :

- État initial : worktree cut depuis main (`e7ca6f4d`), 2 commits derrière `factory/perf` ; BLOCKED signalé. Ruling reçu → `git checkout --detach 64570dbdfa13146902450df946536094dbe43c78` exécuté dans CE worktree uniquement.
- Re-vérification : `git rev-parse HEAD` = `64570dbdfa13146902450df946536094dbe43c78` ✓ ; `docs/checks/perf/b0-local-baseline.md` et `docs/spec/perf-baseline.md` présents ✓.

Plan exécuté (inchangé vs plan initial) : (1) deps offline + `pnpm run types` server/mail ; (2) `pnpm build` ×3 chronométrés, médiane, inventaire bundle client ; (3) serve prod local via `wrangler dev --port 3000` (script `start` d'`apps/mail`, worker assets-only `ssr:false`) ; Lighthouse 13.4.0 headless ×3 sur les pages atteignables non authentifié ; (4) `.dev.vars` : test d'existence uniquement ; ouverture de fil si faisable, sinon BLOCKED partiel ; (5) livrable + checks RUN verbatim.

Désaccord checks/spec : aucun. Vérifié : les 6 RUN du check sont cohérents avec la spec (B0 non gaté, médiane 3 runs, conclusion même partielle acceptée, zéro changement code). Un seul écart d'environnement : `docs/solutions/worktree-wrangler-types.md` (référencé par les notes d'environnement du job) n'existe pas au commit gelé — sans conséquence, `wrangler types` a réussi sans EPERM.

## Ce qui a été mesuré et comment

Détail complet dans le livrable `docs/research/perf-baseline.md` (§ B0 — baseline locale). Synthèse :

**Conditions** : Apple M5 Pro, 64 GiB, macOS 26.4 ; 2026-07-05 ~16:50–17:30 UTC-10 ; node 22.22.3, pnpm 10.15.0 ; Lighthouse 13.4.0, HeadlessChrome 149, throttling défaut `simulate` mobile (RTT 150 ms, 1638 kbps, CPU ×4).

1. **Deps** : `pnpm install --offline --frozen-lockfile --ignore-scripts` → OK en 13,6 s. `pnpm run types` dans `apps/server` puis `apps/mail` → exit 0, pas d'EPERM.
2. **Build ×3** (`/usr/bin/time -p pnpm build`, run 1 à froid, runs 2–3 `--force` pour bypasser le cache turbo) : 50,62 s / 32,36 s / 31,44 s → **médiane 32,36 s**. 1 seule tâche turbo (`@zero/mail:build`). Bundle client : 160 chunks JS, 5,59 MB brut ; top : `use-drafts` 1408 kB (368 kB gz), `ai-sidebar` 879 kB (254 kB gz), `_index` 506 kB (168 kB gz), `entry.client` 178 kB (57 kB gz), `root-*.css` 192 kB (31 kB gz).
3. **Correctif documenté** : le build sans env produisait un client qui crashe (`import.meta.env.VITE_PUBLIC_BACKEND_URL` undefined → page « Application Error » ; vérifié par screenshot Lighthouse ; mesure LCP 5,3 s ×3 écartée comme invalide). Rebuild avec les deux valeurs NON secrètes committées dans `apps/mail/wrangler.jsonc` `env.local` (`http://localhost:8787`, `http://localhost:3000`) — variables d'env au build, zéro modification de fichier.
4. **Lighthouse ×3 par page** sur `wrangler dev --port 3000` :
   - `/` (landing, rendu réel vérifié par screenshot) : **LCP médian 13 701 ms, TBT 40 ms, CLS 0,020**, FCP 4 618 ms, score 0,63. LCP = `<img src="/email-preview.png">` (PNG 1,1 MB) ; page 2 609 KiB dont 2 008 kB d'images.
   - `/login` : **LCP médian 6 574 ms, TBT 0 ms, CLS 0,000**, FCP 5 163 ms, score 0,64. DIT EXPLICITEMENT : seules la landing et /login sont atteignables non authentifié, et `/login` a rendu son fallback « Something went wrong! » (backend éteint, fetch providers échoue) — signal valide du coût de boot SPA (566 kB JS transférés, `ssr:false`), pas du formulaire réel.
5. **Ouverture de fil** : `BLOCKED partiel : .dev.vars absent dans le worktree` (`test -f` sur `apps/mail/.dev.vars`, `apps/server/.dev.vars`, `.env` → tous absents ; existence testée uniquement, jamais lus). Démarrer `apps/server` (DO/Hyperdrive/DB/OAuth) exigerait de copier des secrets — interdit. Aucun chiffre inventé.
6. **Conclusion (dans le livrable)** : goulot local apparent = réseau + rendu 100 % client — (a) landing : hero PNG 1,1 MB domine le LCP ; (b) shell app : ~450–570 kB gz de JS avant tout pixel (FCP 4,6–5,2 s), TBT≈0 donc le main-thread n'est pas la contrainte locale. Goulot de l'app authentifiée : **non concluant — B1 requis** (sync, fil réel, Hyperdrive, R2, latence Tahiti).

## Check evidence — tous les RUN du check gelé, verbatim, depuis la racine du worktree (executor: bash)

```
$ test -f docs/research/perf-baseline.md && echo REPORT_OK
REPORT_OK
exit=0        (attendu: REPORT_OK) ✓

$ grep -c "## B0" docs/research/perf-baseline.md
1
exit=0        (attendu: >= 1) ✓

$ grep -cEi "LCP|TBT|CLS" docs/research/perf-baseline.md
10
exit=0        (attendu: >= 3) ✓

$ grep -cEi "médiane|median" docs/research/perf-baseline.md
5
exit=0        (attendu: >= 1) ✓

$ grep -cEi "goulot|bottleneck|non concluant|inconclusive" docs/research/perf-baseline.md
6
exit=0        (attendu: >= 1) ✓

$ git status --porcelain -- apps packages | wc -l
       0
exit=0        (attendu: 0) ✓
```

6/6 PASS.

Judge-only, auto-évalués : ≥3 runs + médiane + conditions → ✓ (tables complètes dans le livrable) ; limites B0 (local ≠ CF edge, état d'auth explicite, ce que seul B1 répond) → section dédiée ✓ ; aucun secret lu/copié/loggé → ✓ (existence `test -f` uniquement, résultat : absents).

## Limitations d'environnement / substitutions

- Worktree initialement sur le mauvais SHA — corrigé par detach autorisé (ruling orchestrateur).
- `docs/solutions/worktree-wrangler-types.md` inexistant au commit gelé ; non nécessaire (pas d'EPERM).
- `.dev.vars` absents → backend jamais démarré → item ouverture-de-fil BLOCKED partiel ; `/login` mesuré en état d'erreur (dit explicitement).
- Lighthouse installé via `npx` (réseau autorisé pour npx) ; `--headless=new` a fonctionné du premier coup, pas de fallback nécessaire.
- Chiffres LCP/FCP dominés par le throttling simulé Slow-4G de Lighthouse — méthodologie standard, mais local ≠ edge (TTFB ~3 ms).
- Serveur wrangler arrêté après mesures (port 3000 libéré). Sorties laissées non commitées : `docs/research/perf-baseline.md`, `docs/jobs/perf/b0-local-baseline-01.md`. Aucun fichier tracké modifié sous `apps/**`, `packages/**`, `docs/checks/**`.

STATUS: DONE — all frozen RUN checks pass locally
