# Rapport perf — baseline mesurée (run `perf`)

*Spec : `docs/spec/perf-baseline.md` · Checks : `docs/checks/perf/b0-local-baseline.md`.*
*Commit mesuré : `64570dbdfa13146902450df946536094dbe43c78` (tag `freeze/perf-b0`).*

## B0 — baseline locale

### Conditions (identiques pour toutes les mesures)

| Condition | Valeur |
|---|---|
| Machine | Apple M5 Pro, 64 GiB RAM, macOS 26.4 (25E246) |
| Date/heure | 2026-07-05, 16:50–17:30 (UTC-10, Tahiti) |
| Node / pnpm | v22.22.3 / 10.15.0 |
| Lighthouse | 13.4.0, HeadlessChrome 149.0.0.0 (`--chrome-flags="--headless=new"`) |
| Throttling Lighthouse | défaut `simulate`, mobile : RTT 150 ms, 1638 kbps, CPU ×4 (Slow 4G simulé) |
| Serve | `wrangler dev --port 3000` (script `start` de `apps/mail`) sur le build prod ; worker assets-only (`ssr:false`, SPA fallback) |
| Deps | `pnpm install --offline --frozen-lockfile --ignore-scripts` (13,6 s), puis `pnpm run types` dans `apps/server` et `apps/mail` (OK, pas d'EPERM) |
| Backend | `apps/server` NON démarré (nécessite `.dev.vars` — absent ; existence testée uniquement, jamais lu) |

### 1. Build de production — `pnpm build` (turbo, 1 tâche : `@zero/mail:build`)

Méthodologie : 3 runs, `/usr/bin/time -p`, médiane retenue. Run 1 à froid (worktree neuf, cache turbo vide) ; runs 2–3 avec `--force` (cache turbo bypassé, cache FS OS chaud).

| Run | Cache | Wall time (real) |
|---|---|---|
| 1 | froid (turbo + FS) | 50,62 s |
| 2 | `--force`, FS chaud | 32,36 s |
| 3 | `--force`, FS chaud | 31,44 s |
| **Médiane** | | **32,36 s** |

Rebuild correctif ultérieur (avec `VITE_PUBLIC_*` définies, voir §2) : 34,71 s — cohérent.

#### Bundle client (`apps/mail/build/client`) — 89 MB au total (fonts/i18n/images inclus), 160 chunks JS, 5 585 553 octets de JS brut

Top assets JS/CSS (brut, et gzip quand mesuré) :

| Asset | Brut | Gzip |
|---|---|---|
| `use-drafts-*.js` | 1 408 kB | 368 kB |
| `ai-sidebar-*.js` | 879 kB | 254 kB |
| `_index-*.js` (route login/index) | 506 kB | 168 kB |
| `contributors-*.js` | 418 kB | — |
| `entry.client-*.js` | 178 kB | 57 kB |
| `module-*.js` | 171 kB | 58 kB |
| `pixelated-bg-*.js` | 122 kB | — |
| `root-*.css` | 192 kB | 31 kB |

Le shell SPA (`index.html`, fallback prerendu) référence 46 assets, 1 seul `modulepreload`.

### 2. Lighthouse — LCP / TBT / CLS (3 runs par page, médiane)

**Auth : aucune session authentifiée n'est possible en B0** (backend absent). Pages mesurées : `/` (landing marketing — la page réellement atteignable non authentifié) et `/login`.

**Correctif build documenté** : le premier build (sans variables d'environnement) produisait un client qui crashe au boot (`import.meta.env.VITE_PUBLIC_BACKEND_URL` undefined → page « Application Error », LCP 5,3 s ×3 — mesure invalide, écartée). Rebuild avec les valeurs NON secrètes committées dans `wrangler.jsonc` `env.local` (`VITE_PUBLIC_BACKEND_URL=http://localhost:8787`, `VITE_PUBLIC_APP_URL=http://localhost:3000`). Zéro modification de code ; variables d'environnement au build uniquement.

#### `/` — landing (rendu réel vérifié par screenshot Lighthouse)

| Run | LCP | TBT | CLS | FCP | Score perf |
|---|---|---|---|---|---|
| 1 | 13 687 ms | 8 ms | 0,020 | 4 618 ms | 0,63 |
| 2 | 13 701 ms | 105 ms | 0,000 | 4 618 ms | 0,63 |
| 3 | 13 707 ms | 40 ms | 0,020 | 4 622 ms | 0,63 |
| **Médiane** | **13 701 ms** | **40 ms** | **0,020** | **4 618 ms** | **0,63** |

Diagnostic : élément LCP = `<img src="/email-preview.png">` — PNG de 1 133 020 octets (1107 kB transférés), + `nizzy.jpg` 736 kB. Poids page 2 609 KiB dont 2 008 kB d'images ; JS transféré 448 kB.

#### `/login` — ATTENTION : état d'erreur mesuré

Le fetch des providers (`/api/public/providers`) échoue backend éteint → la route rend son fallback « Something went wrong! » (vérifié par screenshot). Les chiffres restent un signal valide du **coût de boot du shell SPA** (le JS chargé est celui de la route), mais PAS du formulaire de login réel.

| Run | LCP | TBT | CLS | FCP | Score perf |
|---|---|---|---|---|---|
| 1 | 6 588 ms | 0 ms | 0,000 | 5 173 ms | 0,64 |
| 2 | 6 574 ms | 0 ms | 0,000 | 5 163 ms | 0,64 |
| 3 | 6 571 ms | 0 ms | 0,000 | 5 161 ms | 0,64 |
| **Médiane** | **6 574 ms** | **0 ms** | **0,000** | **5 163 ms** | **0,64** |

Diagnostic : LCP = `<h2>` texte, rendu après boot JS ; 566 kB de JS transféré, 0 image. FCP ≈ 5,2 s = page blanche tant que le JS n'est pas chargé/exécuté (`ssr:false`, aucun HTML serveur).

### 3. Temps d'ouverture de fil (seed data)

**BLOCKED partiel : `.dev.vars` absent dans le worktree** (`test -f apps/mail/.dev.vars`, `apps/server/.dev.vars`, `.env` → tous absents ; existence testée uniquement). Démarrer `apps/server` (DO, Hyperdrive, DB, OAuth) exigerait de copier/manipuler des secrets — interdit pour ce job. Aucune mesure de fil inventée.

### 4. Conclusion — goulot apparent

Le goulot local est **le réseau et le rendu 100 % client, pas le CPU** :

1. **Landing `/`** : goulot = images non optimisées — un hero PNG de 1,1 MB (1920×1080, `loading="eager"`) domine un LCP de 13,7 s sous Slow 4G simulé. Gain évident et isolable (WebP/AVIF + dimensionnement).
2. **Shell applicatif** : goulot = JS bloquant le premier rendu — `ssr:false` signifie zéro pixel avant ~450–570 kB gzip de JS (FCP 4,6–5,2 s sous throttling). TBT ≈ 0 ms et CLS ≈ 0 partout : le main-thread n'est PAS la contrainte en local (M5 Pro ; à relativiser sur mobile réel).
3. Chunks lourds identifiés pour P1-P6 : `use-drafts` (368 kB gz), `ai-sidebar` (254 kB gz), `_index` (168 kB gz).

**Le goulot de l'app authentifiée reste non concluant en B0 — B1 requis** : ouverture de fil réel, sync initiale, Hyperdrive froid/chaud, R2, latence Tahiti→edge — rien de tout cela n'est mesurable sans le backend déployé.

### Limites de validité de B0

- **Serve local ≠ CF edge** : wrangler dev sur localhost (TTFB ~3 ms) ne dit rien de la latence Tahiti→Cloudflare, du cache edge, ni de DO/Hyperdrive/R2. Les LCP/FCP ci-dessus sont dominés par le throttling *simulé* de Lighthouse, pas par un réseau réel.
- **État d'auth** : tout est mesuré NON authentifié ; `/login` est mesuré dans son état d'erreur (backend éteint) ; la boîte mail authentifiée n'a pas été mesurée du tout.
- **Machine** : M5 Pro 64 GiB — les temps de build ne sont pas transposables au CI ; le CPU ×4 simulé reste optimiste vs un mobile milieu de gamme.
- **Ce que seul B1 peut répondre** : le goulot réel perçu par un utilisateur connecté depuis Tahiti (sync, ouverture de fil, Hyperdrive froid/chaud, payloads R2), et la part edge vs payload dans le LCP réel.

## B1 — baseline staging (Cloudflare, depuis Tahiti)

*Checks : `docs/checks/perf/b1-staging-baseline.md`. Cibles LIVE mesurées telles quelles (aucun redéploiement) :*
*front `https://zero-staging.devlab-tahiti.workers.dev` (worker assets-only, SPA), API `https://zero-server-staging.devlab-tahiti.workers.dev` (Workers plan payant, Hyperdrive → Railway PG `hayabusa.proxy.rlwy.net`).*

### Conditions

| Condition | Valeur |
|---|---|
| Date/heure | 2026-07-05, 18:29–18:40 (UTC-10, Tahiti) — samedi soir |
| Poste | Apple M5 Pro, macOS 26.4, réseau fixe Tahiti via `en0` |
| **Cloudflare WARP actif** | `warp=on`, egress via colo **SYD** (Sydney) — vérifié `/cdn-cgi/trace`. Non désactivé (config réseau de Thomas, non modifiée par ce job) ; toutes les mesures traversent le tunnel WARP Tahiti→SYD |
| RTT lien | ICMP vers 1.1.1.1 : min 119 ms / moy 141 ms / max 183 ms (jitter σ 27 ms) ; TTFB keep-alive vers le worker : 140–200 ms |
| Lighthouse | 13.4.0, `--chrome-flags="--headless=new"`, `--only-categories=performance`, throttling défaut `simulate` mobile (RTT 150 ms, 1638 kbps, CPU ×4) — méthodologie identique à B0 |
| curl | 8.19.0, `-w` (`time_namelookup/appconnect/starttransfer/total`) ; nouvelle connexion TCP+TLS par requête sauf mention « keep-alive » |
| Rendu vérifié | Screenshots Lighthouse : `/` = landing réelle (hero + email-preview), `/login` = **vrai formulaire « Continue with Google »** (contrairement à B0 qui mesurait l'état d'erreur) |

### 1. Lighthouse — `/` et `/login` (3 runs, médiane)

#### `/` — landing

| Run | LCP | FCP | TBT | CLS | Score perf |
|---|---|---|---|---|---|
| 1 | 12 940 ms | 4 244 ms | 69 ms | 0,044 | 0,60 |
| 2 | 12 966 ms | 4 300 ms | 164 ms | 0,044 | 0,55 |
| 3 | 11 858 ms | 4 241 ms | 321 ms | 0,029 | 0,54 |
| **Médiane** | **12 940 ms** | **4 244 ms** | **164 ms** | **0,044** | **0,55** |

Poids page : 2 547 kB transférés dont **2 013 kB d'images** (16 requêtes ; `email-preview.png` 1 108 kB, `nizzy.jpg` 737 kB), 468 kB de JS (56 scripts).

#### `/login` — formulaire réel (backend joignable, providers OK)

| Run | LCP | FCP | TBT | CLS | Score perf |
|---|---|---|---|---|---|
| 1 | 6 099 ms | 4 375 ms | 0 ms | 0,004 | 0,67 |
| 2 | 6 199 ms | 4 464 ms | 0 ms | 0,004 | 0,67 |
| 3 | 6 327 ms | 4 869 ms | 0 ms | 0,004 | 0,65 |
| **Médiane** | **6 199 ms** | **4 464 ms** | **0 ms** | **0,004** | **0,67** |

Poids page : 625 kB dont 561 kB de JS (59 scripts), 0 image.

#### Comparaison B0 ↔ B1 (médianes)

| Page | Métrique | B0 (local) | B1 (staging CF) | Δ |
|---|---|---|---|---|
| `/` | LCP | 13 701 ms | 12 940 ms | −5,6 % |
| `/` | FCP | 4 618 ms | 4 244 ms | −8,1 % |
| `/` | TBT | 40 ms | 164 ms | +124 ms |
| `/` | CLS | 0,020 | 0,044 | +0,024 |
| `/login` | LCP | 6 574 ms* | 6 199 ms | −5,7 % |
| `/login` | FCP | 5 163 ms* | 4 464 ms | −13,5 % |
| `/login` | TBT | 0 ms | 0 ms | = |

\* B0 `/login` mesurait l'état d'erreur (backend éteint) ; la quasi-identité des chiffres avec le vrai formulaire confirme que le coût est le **boot du shell SPA**, pas le contenu de la route.

**Lecture** : B1 ≈ B0 à ±10 %. Le throttling *simulé* de Lighthouse domine ces métriques lab dans les deux cas — l'edge CF ne change presque rien au LCP/FCP parce que le goulot est le **poids de la page** (images + JS), pas l'origine. C'est la confirmation staging du verdict B0.

### 2. Latence API froid vs chaud — `/api/public/providers` (Hyperdrive : voir limite)

Protocole : premier hit après idle >60 s (« froid ») vs répétitions immédiates (« chaud »). Secondes, `curl -w`, nouvelle connexion TLS par requête sauf mention.

| Échantillon (heure) | Idle | dns | tls (`time_appconnect`) | TTFB (`time_starttransfer`) | total |
|---|---|---|---|---|---|
| FROID 1 (18:29:15) | premier hit du job | 0,169 | 0,425 | **1,631** | 1,752 |
| FROID 2 (18:32:12) | ~100 s | 0,002 | 0,364 | **1,668** | 1,668 |
| FROID 3 (18:36:11) | 90 s | 0,127 | 0,370 | **1,736** | 1,861 |
| FROID 4 (18:38:13) | 120 s | 0,002 | 0,323 | **0,646** — isolate resté chaud | 0,646 |
| **Médiane (4 hits post-idle)** | | | | **1,650 s** | |

Nuance : 3 hits post-idle sur 4 paient la pénalité froide (~1,6–1,7 s) ; le 4ᵉ (pourtant 120 s d'idle) ressort au niveau chaud — l'éviction de l'isolate n'est pas déterministe à ces échelles d'idle. La pénalité froide, quand elle survient, est ~1,0–1,1 s au-dessus du chaud.

Chaud, nouvelles connexions (10 échantillons, 18:29 + 18:34) : TTFB 0,543 / 0,551 / 0,590 / 0,590 / 0,607 / 0,623 / 0,629 / 0,637 / 1,769 / 3,992 → **médiane 0,615 s** (2 outliers réseau conservés, voir jitter).
Chaud, **keep-alive** (connexion réutilisée, 4 échantillons) : TTFB 0,140 / 0,156 / 0,197 / 0,198 → **médiane 0,177 s** ≈ RTT pur Tahiti→SYD + traitement worker quasi nul.

Décomposition : à froid, ~1,0–1,1 s s'ajoutent au TTFB chaud à connexion égale (~0,6 s) → coût d'**init de l'isolate/module worker** (bundle serveur lourd au premier chargement). À chaud, le TTFB « nouvelle connexion » est dominé par 3 aller-retours réseau (TCP+TLS+HTTP ≈ 3 × RTT 150–200 ms) ; le traitement serveur réel est <50 ms (vu en keep-alive).

**Limite Hyperdrive (honnête)** : lecture du code (`apps/server/src/routes/auth.ts:7-50`) — `/api/public/providers` ne lit **que des variables d'env** : ni Hyperdrive, ni Postgres, ni DO. Aucun endpoint non authentifié ne traverse Hyperdrive. Le froid/chaud ci-dessus mesure l'init du Worker, **pas** le pool Hyperdrive→Railway. **Hyperdrive froid/chaud réel : BLOCKED partiel — session authentifiée requise (mesure manuelle avec Thomas)**.

### 3. Livraison des assets statiques depuis Tahiti (edge CF)

HTML `/` (6 212 o, 4 runs) : TTFB 0,449 / 0,494 / 0,702 / 1,673 → **médiane 0,598 s**.

Plus gros chunk JS : `use-drafts-CmKOXRuD.js` — 1 408 245 o brut, ~383 kB en zstd, `cf-cache-status: HIT`, `cache-control: public, immutable, max-age=31536000`. 9 runs compressés en 2 fenêtres :

| Fenêtre | Runs (total, s) | TTFB (s) | Débit effectif |
|---|---|---|---|
| 18:30 | 1,25 / 1,22 / 1,28 / 1,12 | 0,47–0,53 | ~300–340 kB/s |
| 18:37 | 4,93 / 3,79 / 8,79 / 8,36 / 3,53 | 0,53–1,54 | ~44–109 kB/s |
| **Médiane (9 runs)** | **3,53 s** | **0,53 s** | — |

`ai-sidebar-CPCLigsm.js` (~253 kB zstd, HIT) : totaux 3,04 / 3,61 / 4,62 / 5,55 s sur les mêmes fenêtres. Brut non compressé (1 408 kB) : 2,85–3,21 s.

**Lecture** : le TTFB edge est bon et stable (~0,5 s, cache HIT systématique — l'edge CF fait son travail). Le problème est le **débit descendant réel depuis Tahiti : 44–340 kB/s selon la minute** (facteur ×7 entre fenêtres, tunnel WARP + lien Tahiti). Un seul chunk de 383 kB gz coûte **1,2 à 8,8 s** de téléchargement réel. Le shell applicatif (~450–570 kB gz avant premier pixel, cf. B0) coûte donc **2 à 12 s de réseau réel** selon l'heure — le poids client n'est pas un problème « lab », c'est le vécu local.

### 4. Latence de sync initiale

Aucune donnée laissée par l'orchestrateur dans `docs/jobs/perf/` (vérifié : seuls les fichiers B0 y figurent) ; l'interrogation du Postgres Railway est hors périmètre de ce job (aucun credential — volontaire). **Sync initiale : réservé — mesuré par l'orchestrateur.**

### 5. Ouverture de fil authentifiée

**BLOCKED partiel : session authentifiée requise — mesure manuelle avec Thomas.** Le seul login est Google OAuth (confirmé par `/api/public/providers` : provider unique `google`), impossible headless sans cookies de session (interdits pour ce job). Proxy non authentifié envisagé puis écarté : aucun endpoint public ne touche DO/Hyperdrive/R2, donc aucun proxy honnête n'existe pour l'ouverture de fil.

### 6. Conclusion B1 — goulot et classement P0-P6

Le goulot staging confirme et aggrave le verdict B0 : **P0 — poids client (bottleneck n°1)**. L'edge CF est sain (TTFB ~0,5 s, HIT, isolate chaud <50 ms de traitement) ; ce qui coûte, c'est ce qu'on fait transiter : 2 MB d'images sur `/`, ~0,5 MB gz de JS avant le premier pixel du shell (`ssr:false` = page blanche pendant tout le téléchargement), sur un lien Tahiti à débit très variable (44–340 kB/s mesurés à 7 min d'écart). Deuxième goulot structurel : **la distance** — chaque round-trip Tahiti→edge coûte 150–200 ms incompressibles, et chaque connexion fraîche ~0,6 s.

Classement des candidats par impact attendu, chiffres à l'appui :

| Rang | Candidat | Justification chiffrée |
|---|---|---|
| 0 | **P0 poids client** (hors liste P1-P6, à créer) | 383 kB gz = 1,2–8,8 s réels ; images landing 2 MB ; LCP 12,9 s lab. Gain le plus grand et le plus sûr : images WebP/AVIF + code-splitting de `use-drafts`/`ai-sidebar` |
| 1 | **P1 cache local-first** | Chaque ouverture depuis le serveur paie ≥0,18 s (keep-alive) à 0,6 s (connexion fraîche) + payload sur lien à 44–340 kB/s ; un cache IndexedDB ramène la réouverture à ~0 réseau. Effet maximal précisément là où le réseau est mauvais |
| 2 | **P2 optimistic UI** | Toute action non optimiste coûte au minimum le RTT 150–200 ms, en pratique ~0,6 s perçu par action (TTFB médian chaud). Coût d'implémentation faible, gain perçu systématique |
| 3 | **P3 préchargement fil suivant** | Même logique que P1 (masquer le RTT + payload), mais gain non chiffrable sans mesure d'ouverture de fil (BLOCKED §5) — probable, non confirmé |
| 4 | **P5 tuning sync Gmail** | Sync initiale non mesurée (§4, réservé orchestrateur) ; l'impact ne peut pas être classé plus haut sans chiffre |
| 5 | **P6 skeletons** | FCP 4,2–4,5 s lab : le blanc pré-JS n'est PAS adressable par des skeletons client (`ssr:false` — rien ne s'affiche avant le JS). Utile seulement pour les chargements intra-app, après P0/P1 |
| 6 | **P4 virtualisation** | TBT médian 0–164 ms, CLS ≤0,044 : le main-thread n'est le goulot nulle part dans nos mesures. Aucune donnée ne justifie de le prioriser |

### Limites de validité de B1

- **WARP actif** : egress SYD via tunnel Cloudflare — les chiffres réseau incluent le tunnel. Ils reflètent le poste réel de Thomas (WARP y tourne en permanence), mais pas un visiteur lambda de Tahiti (qui sortirait par son FAI, probablement vers le même colo régional).
- **Fenêtre courte un samedi soir** : le débit varie d'un facteur 7 en 7 minutes ; une baseline multi-heures affinerait les médianes de débit.
- **Froid = init worker, pas Hyperdrive** (§2) ; **parcours authentifié non mesuré** (§5) ; **sync initiale réservée** (§4).
- Lighthouse en throttling simulé : LCP/FCP lab ≈ B0 par construction ; les mesures curl (réseau réel) sont la vraie valeur ajoutée de B1.
