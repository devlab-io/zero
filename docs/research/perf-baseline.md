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
