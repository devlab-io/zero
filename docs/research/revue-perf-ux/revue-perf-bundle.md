# Revue perf — poids client résiduel & chemin de chargement critique

*Repo `~/cc/zero`, branche `factory/perf`. Build prod mesuré le 2026-07-12, `pnpm build:frontend` (14,97 s, exit 0). Baseline de référence : `docs/research/perf-baseline.md`.*

## Cadre de conversion (réalité réseau Tahiti, tiré de B1)

- Débit descendant réel mesuré : **44–340 kB/s** (facteur ×7 selon la minute, tunnel WARP + lien Tahiti).
- RTT Tahiti→edge CF : **150–200 ms** ; connexion fraîche ≈ 0,6 s ; edge sain (TTFB ~0,5 s, cache HIT).
- `ssr:false` : **page blanche tant que le shell JS n'est pas téléchargé + exécuté**. Chaque kB gzip du chemin critique retarde le premier pixel.
- Règle : `temps ≈ taille_gzip_kB / débit`. 100 kB gz = **0,3 s (à 340 kB/s) à 2,3 s (à 44 kB/s)**.

## État global mesuré (fait vérifié)

| Métrique | Baseline (B0) | Actuel | Δ |
|---|---|---|---|
| JS brut total | 5 585 kB | **4 183 kB** (168 chunks) | −25 % |
| Plus gros chunk JS | use-drafts 1408 kB | **ai-sidebar 552 kB** | −61 % |
| `use-drafts` (1408 kB) | présent | **disparu** (splitté en `use-compose-editor` 495 kB) | ✅ |
| `ai-sidebar` | 879 kB | 552 kB (151 kB gz) | −37 % |
| Shell : modulepreload | 1 seul | **45 chunks** (le P0 a ajouté le preload) | — |
| `build/client` total | 89 MB | **87 MB** (75 MB = `public/`) | ~= |

Le poids JS a bien baissé. **Le chemin critique reste le vrai sujet** : ce qui bloque le premier pixel n'est pas la somme du bundle mais les **45 chunks préchargés par le shell + le chunk de contenu inbox**, et surtout des dépendances lourdes chargées **inconditionnellement sur toutes les routes**.

---

## Chemin de chargement critique (fait vérifié — lecture de `build/client/index.html` + manifest RR)

Le shell SPA (`index.html`, fallback prerendu servi pour **toute** route) déclare **45 `modulepreload` + le CSS root**. Ce sont les **42 imports statiques de la route `root`** (root.tsx → ServerProviders + ClientProviders) que **chaque visiteur télécharge avant tout rendu**, landing et login compris.

**Coût du shell critique = 1068 kB brut / 371 kB gz JS + 29,5 kB gz CSS ≈ 371 kB gz.**
→ Temps réseau Tahiti : **1,1 s (340 kB/s) à 8,4 s (44 kB/s)** avant le moindre pixel.

Puis, pour afficher l'inbox, la route `/mail` (module `page-CkCep2mE.js`, 0,1 kB) lazy-importe le chunk de contenu **`page-ZUAj90KO.js` = 409 kB / 128 kB gz** (contient `MailLayout`, `ThreadList`, `thread-display`, + `marked` + `highlight.js` + lucide).

**Time-to-inbox réel (avant données) = shell 371 gz + contenu 128 gz ≈ 499 kB gz → 1,5 s à 11,3 s de réseau Tahiti**, hors round-trips API et payload des fils.

Décomposition du shell critique (gzip) :
| Bloc | gz | Nature | Compressible ? |
|---|---|---|---|
| React + react-dom runtime (`entry.client` 55 + `chunk-QMGIS6GS` 36 + jsx/scheduler) | ~110 | Runtime React | Non (socle) |
| **`module-aZ3AJcUE` = PostHog + Sentry** | **56** | Analytics + error tracking | **Oui — à sortir du critique** |
| **`proxy-m0jsKyrP` = framer-motion** | **36** | Animation | **Oui — à sortir du critique** |
| `query-provider` = tRPC + superjson | 19 | Data layer | Partiel |
| better-auth, sidebar, radix, nuqs, jotai, icons… | ~150 | UI + auth | Partiel (tree-shake radix, icônes) |

---

## Constats classés (fichier:ligne · impact Tahiti · sévérité · effort)

### P0 — majeurs

**1. Onboarding : 3 GIF de 10–19 MB dans le chemin utilisateur (48 MB)**
`apps/mail/public/onboarding/step1.gif` (19,1 MB), `step2.gif` (19,1 MB), `step3.gif` (10,4 MB) + `ready.png` (5,5 MB) + `get-started.png` (1,4 MB). Référencés par `onboarding-EvKRqQr9.js` (flux onboarding réel).
- **Impact** : un seul GIF de 19 MB = **56 s (340 kB/s) à 7 min (44 kB/s)** de téléchargement. Les GIF sont déjà « compressés » : gzip/zstd n'y change quasi rien. Un nouvel utilisateur Tahiti attend potentiellement **plusieurs minutes** sur l'onboarding.
- **Fait vérifié** (tailles mesurées + chunk référent identifié).
- **Reco** : convertir en `<video>` MP4/WebM (H.264/VP9) — gain typique ×10–20 (un GIF de 19 MB → ~1–2 MB de vidéo). Sévérité **P0**, effort **M** (encoder + remplacer `<img>` par `<video autoplay muted loop playsinline>`).

**2. Chemin critique inbox ≈ 499 kB gz avant le premier pixel utile**
`build/client/index.html` (45 modulepreload) + `page-ZUAj90KO.js` (contenu inbox).
- **Impact** : **1,5 s à 11,3 s** de réseau pur avant que l'inbox s'affiche, sur `ssr:false` (blanc total pendant tout ce temps). C'est le vécu dominant, pas un chiffre lab.
- **Fait vérifié** (somme mesurée des chunks preload + chunk de contenu).
- **Reco** : (a) sortir PostHog+Sentry+framer-motion du critique (constats 4-5, −92 kB gz ≈ −0,3 à −2,1 s) ; (b) découper `page-ZUAj90KO` (marked + highlight.js n'ont pas à être dans le chunk d'ouverture d'inbox — voir constat 8) ; (c) prerender d'un shell (constat 6). Sévérité **P0**, effort **L** (chantier dédié).

### P1 — importants

**3. `page-ZUAj90KO.js` — chunk inbox monolithique 409 kB / 128 kB gz**
`build/client/assets/page-ZUAj90KO.js` : `MailLayout`+`ThreadList`+`thread-display`, avec `marked` (22 occ.), `highlight.js` (17 occ.), lucide (21), jszip (2).
- **Impact** : 128 kB gz = **0,4 à 2,9 s** ajoutés à chaque première ouverture d'inbox. `marked` (parsing markdown) + `highlight.js` (coloration syntaxique, lourde, potentiellement toutes langues) chargés à l'ouverture alors qu'ils ne servent qu'au rendu de certains contenus IA/markdown.
- **Fait vérifié** (chunk identifié + signatures libs).
- **Reco** : isoler `marked`+`highlight.js` derrière un `React.lazy` déclenché seulement au rendu d'un contenu markdown/code ; restreindre highlight.js aux langages utiles. Sévérité **P1**, effort **M**.

**4. PostHog + Sentry chargés inconditionnellement dans le critique (56 kB gz)**
`module-aZ3AJcUE.js` = posthog-js (115 occ.) + @sentry/react (11 occ.). `app/providers/client-providers.tsx:5,28` (PostHogProvider), `app/root.tsx:24` + `app/instrument.ts` (Sentry).
- **Impact** : **56 kB gz = 0,16 à 1,3 s** sur **chaque** page (landing, login, inbox), même quand les clés sont absentes. `lib/posthog-provider.tsx:12` fait bien un `return` si `VITE_PUBLIC_POSTHOG_KEY` manque, et `instrument.ts` gate `Sentry.init` sur le DSN — **mais les deux librairies sont importées statiquement, donc bundlées quoi qu'il arrive**. `root.tsx` appelle `Sentry.captureException`/`reactErrorHandler` sans condition.
- **Fait vérifié** (chunk + gating lu dans la source).
- **Reco** : import dynamique (`import()`), déclenché post-hydratation / `requestIdleCallback`, et seulement si la clé/DSN est présent. Devlab n'utilise probablement ni PostHog ni Sentry en prod → gain quasi net de 56 kB gz sur le critique. Sévérité **P1**, effort **S–M**.

**5. framer-motion dans le chemin critique (36 kB gz)**
`proxy-m0jsKyrP.js` = framer-motion (code identifié : `AnimatePresence`, `transformPagePoint`, `reducedMotion`, `isPresent`). C'est **1 des 42 imports statiques de `root`** (présent dans les modulepreload du shell).
- **Impact** : **36 kB gz = 0,11 à 0,82 s** sur toutes les pages, y compris landing/login qui n'ont pas besoin d'animations complexes. Tiré transitivement par un composant du shell (Toaster/sidebar/drawer — importeur exact à confirmer).
- **Fait vérifié** pour la présence critique ; **probable** pour l'importeur précis.
- **Reco** : identifier l'importeur shell (grep `motion`/`AnimatePresence` dans sidebar/toast/sonner) et le rendre lazy, ou remplacer les animations shell par du CSS. Sévérité **P1**, effort **M**.

**6. Landing `/` non prerendue — blanc pré-JS sur la page marketing**
`apps/mail/react-router.config.ts` : `prerender: ['/manifest.webmanifest']` uniquement ; `ssr:false`.
- **Impact** : la landing (page d'acquisition, souvent première impression) est rendue 100 % client → **FCP 4,2 s lab / plusieurs secondes de blanc réseau Tahiti** avant tout contenu, alors que son contenu est quasi statique.
- **Fait vérifié** (config lue).
- **Reco** : ajouter `/`, `/pricing`, `/about` au `prerender` (React Router SPA supporte le prerender de routes statiques → vrai HTML servi, contenu visible avant le JS). Critical CSS déjà inline via le `<link>` root. Sévérité **P1**, effort **M**.

**7. Aucune stratégie `manualChunks`**
`apps/mail/vite.config.ts` : `grep manualChunks` = 0. Le découpage repose entièrement sur les défauts RR/rollup → 168 chunks, 45 dans le shell, granularité non pilotée.
- **Impact** : indirect mais structurel — empêche de regrouper le socle stable (react/vendor) et de séparer proprement l'analytics/animation du critique. Multiplie aussi les requêtes (45 chunks preload = 45 entrées, atténué par HTTP/2 mais coûteux au RTT 150–200 ms).
- **Fait vérifié**.
- **Reco** : définir `build.rollupOptions.output.manualChunks` (socle react-vendor, radix-vendor, isoler posthog/sentry/framer hors entrée). Sévérité **P1**, effort **M**, en support des constats 2/4/5.

### P2 — notables

**8. `/contributors` embarque recharts (408 kB / 111 kB gz)**
`build/client/assets/contributors-DoTyjqaq.js` = recharts (77 occ.) + lodash (3) + d3 (transitif). Route `(full-width)/contributors.tsx`.
- **Impact** : **111 kB gz = 0,33 à 2,5 s** pour une page marketing « contributeurs ». Bien code-splittée (chunk isolé) donc hors critique, mais recharts+d3 est surdimensionné pour ce besoin.
- **Fait vérifié**.
- **Reco** : remplacer recharts par un graphe SVG maison / une lib légère (uPlot, ou statique), ou supprimer la page si non stratégique pour Devlab. Sévérité **P2**, effort **M**.

**9. Éditeur : `use-compose-editor` 495 kB / 166 kB gz (tiptap + prosemirror + highlight.js)**
`build/client/assets/use-compose-editor-BGlH5XM4.js` = prosemirror (59) + tiptap (25) + highlight.js (15) + emoji (27). Lazy (bien), chargé à la composition.
- **Impact** : **166 kB gz = 0,5 à 3,8 s** à la première ouverture du composeur. Acceptable car lazy, mais highlight.js y est **dupliqué** avec `page-ZUAj90KO` et `command-palette` (voir 10).
- **Fait vérifié**.
- **Reco** : mutualiser highlight.js dans un chunk partagé + restreindre les langages ; vérifier que l'emoji dataset (déjà patché en `emojis: []` dans vite.config) ne réintroduit pas les 480 kB via `github-emojis-*.json`. Sévérité **P2**, effort **M**.

**10. highlight.js présent dans ≥3 chunks (duplication)**
Occurrences dans `page-ZUAj90KO` (17), `use-compose-editor` (15), `command-palette-context` (5). highlight.js est notoirement lourd.
- **Impact** : poids répété + non partagé → chaque chunk paie son highlight.js.
- **Fait vérifié** (signatures) / taille exacte par chunk **non isolée**.
- **Reco** : chunk `highlight` unique via manualChunks + sous-ensemble de langages (`lowlight`/`common` only). Sévérité **P2**, effort **S–M**.

**11. i18n : 19 locales embarquées côté client pour un usage FR/EN**
`apps/mail/messages/*.json` = 19 locales (ar, ca, cs, de, en, es, fa, fr, hi, hu, ja, ko, lv, nl, pl, pt, ru, tr, vi), 580 kB source. Stratégie paraglide `['cookie','baseLocale']` (vite.config:84) → locale choisie au runtime, donc **toutes les variantes doivent être disponibles client-side**. Chaînes AR/RU/JA/ES retrouvées dans 3–5 chunks chacune.
- **Impact** : 17 locales inutiles (dont scripts non-latins qui compressent mal) dispersées dans les chunks. **Probable** ~40–80 kB gz de texte jamais affiché par un utilisateur Devlab.
- **Fait vérifié** (19 locales, stratégie) / **hypothèse** sur le chiffre gz exact (paraglide inline les variantes, isolation difficile sans instrumentation).
- **Reco** : réduire à `['fr','en']` dans `project.inlang` (supprimer les JSON inutiles) → tree-shaking mécanique de tout le texte des 17 autres. Sévérité **P2**, effort **S** (gain sûr, à mesurer).

**12. SVG d'icônes d'attachement = raster base64 (4,4 MB pour 10 fichiers)**
`apps/mail/public/assets/attachment-icons/*.svg` : chaque `.svg` fait ~460 kB et contient un `<rect fill="url(#pattern0)">` avec image **base64** 1024×1024 (pdf.svg, word.svg, csv.svg, etc.). Affichés dans l'inbox quand un fil a des pièces jointes.
- **Impact** : ~460 kB par type d'icône affiché → **1,4 à 10 s** pour une seule icône d'attachement sur lien Tahiti. Multiplié si plusieurs types visibles.
- **Fait vérifié** (contenu base64 confirmé).
- **Reco** : remplacer par de vrais SVG vectoriels (<5 kB) ou une sprite/icon-font. Sévérité **P2**, effort **S**.

### P3 — mineurs (dette de disque / propreté, faible coût runtime)

**13. CSS orphelin `server-build-CJN8thHX.css` (195 kB / 30 kB gz)**
`build/client/assets/server-build-CJN8thHX.css` : **0 référence** en JS et 0 dans `index.html` (le build log le « déplace du server build vers client assets »). Quasi-doublon de `root-DEiqSneS.css` (192 kB). Jamais téléchargé (rien ne le lie) → coût runtime nul, mais 195 kB de disque mort déployés + signal d'un artefact de build.
- **Fait vérifié**. Sévérité **P3**, effort **S** (config build à nettoyer).

**14. Fonts TTF orphelines (`public/fonts/geist/`, 720 kB)**
9 `.ttf` Geist (78 kB chacun). L'app utilise en réalité les **woff2 variables fontsource** (`geist-latin-wght-normal-*.woff2` etc., 6 fichiers ~112 kB, référencés dans `root-DEiqSneS.css`). Les TTF ne sont référencés nulle part (grep `/fonts/` = 0).
- **Impact** : 720 kB déployés jamais servis (coût runtime nul, disque/propreté).
- **Fait vérifié**. Sévérité **P3**, effort **S** (supprimer le dossier).

**15. Images publiques lourdes orphelines ou surdimensionnées**
`public/purple-gradient.png` (**8,5 MB**) → **0 référence source** (mort). `public/homepage-image.png` (613 kB) → 0 référence (mort). `public/pricing-gradient.png` (3,6 MB) → référencé (2×, fond pricing, énorme). `public/nizzy.jpg` (754 kB) → landing (1 réf). `public/small-pixel.png` (377 kB) → 2 réf.
- **Impact** : purple-gradient 8,5 MB = disque mort ; pricing-gradient 3,6 MB = **11 s à 82 s** si affiché sur `/pricing` ; nizzy 754 kB persiste sur la landing (déjà signalé au baseline).
- **Fait vérifié** (tailles + comptage de références).
- **Reco** : supprimer purple-gradient/homepage-image ; convertir pricing-gradient + nizzy en WebP/AVIF dimensionné. Sévérité **P3** (orphelins) / **P2** pour pricing-gradient si réellement affiché, effort **S**.

*Divers non chiffrés en détail : `favicon.ico` 91 kB (lourd pour un favicon, optimisable) ; `og.png` 102 kB (OK).*

---

## Quick wins (heures) vs chantiers (vague dédiée)

**Quick wins (S, gain immédiat) :**
- Constat 4 — import dynamique conditionnel PostHog/Sentry → **−56 kB gz du critique** (Devlab n'utilise probablement ni l'un ni l'autre).
- Constat 11 — réduire paraglide à `['fr','en']` → gain i18n mécanique.
- Constats 13/14/15 — supprimer CSS orphelin (195 kB), TTF orphelins (720 kB), purple-gradient/homepage-image (9 MB) → nettoyage de déploiement.
- Constat 12 — vraies icônes SVG (4,4 MB → quelques kB).

**Chantiers (M/L, vague dédiée) :**
- Constat 1 — GIF onboarding → vidéo (**le plus gros gain unitaire** : −45 MB pour les nouveaux utilisateurs).
- Constats 2/6/7 — prerender shell/landing + `manualChunks` + réduction du critique.
- Constats 3/9/10 — isoler marked/highlight.js hors du chunk d'ouverture inbox et les mutualiser.
- Constat 8 — remplacer recharts sur `/contributors`.

## Priorisation par impact Tahiti (fait vérifié)

| Rang | Action | Gain réseau Tahiti | Sév. | Effort |
|---|---|---|---|---|
| 1 | GIF onboarding → vidéo | −45 MB (jusqu'à −7 min/GIF pour un nouvel user) | P0 | M |
| 2 | Sortir PostHog+Sentry+framer du critique | −92 kB gz (−0,3 à −2,1 s sur **toutes** les pages) | P1 | S–M |
| 3 | Prerender landing/`/` + shell statique | supprime le blanc pré-JS sur l'acquisition | P1 | M |
| 4 | Isoler marked/highlight hors chunk inbox | −partie des 128 kB gz du contenu inbox | P1 | M |
| 5 | Nettoyage orphelins (CSS 195k + TTF 720k + img 9 MB) | disque de déploiement + hygiène | P3 | S |
| 6 | Icônes attachement raster→vectoriel | −4,4 MB, −1,4 à −10 s par icône affichée | P2 | S |
| 7 | i18n 19→2 locales | ~40–80 kB gz (probable) dispersés | P2 | S |
| 8 | recharts hors `/contributors` | −111 kB gz sur cette route | P2 | M |

## Limites de validité

- Tailles gzip mesurées avec `gzip -9` local ; l'edge CF sert en **zstd** (légèrement meilleur) — les gz ci-dessus sont une borne haute réaliste, cohérente avec les mesures curl de B1 (383 kB zstd pour use-drafts vs 368 kB gz baseline).
- Les temps Tahiti utilisent la fourchette B1 (44–340 kB/s) : la borne basse (44 kB/s) est un creux mesuré un samedi soir, pas une moyenne. La borne haute (340 kB/s) est le meilleur cas observé.
- Importeur exact de framer-motion dans le shell : **non confirmé** (présence critique confirmée, chaîne d'import transitive à tracer).
- Chiffre gz précis du gaspillage i18n : **hypothèse** (paraglide inline les variantes de locale, isolation exacte non instrumentée).
- Parcours authentifié (ouverture de fil réel, payload R2) : hors périmètre de cette revue de bundle (nécessite session, cf. B1 §5).
