# w2cd-client-weight-01 — [niveau9] V4.4 poids client / chemin critique JS

Issue: devlab-io/zero#33. Gate gelé: `docs/checks/niveau8/performance.md` §JS critique
= **≤ 420 KiB gz JS critique inbox** ET **aucun chunk > 900 KiB** (read-only, rejoué par
check-runner + juge froid).

## PHASE 0 — grounding (MIRROR: ORCHESTRATOR)

- Worktree: `/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/w2cd-client-weight-01`
- `git rev-parse HEAD` = `107ba348752d3ca5140cf5c940e18b4e66bda8eb` → **CONFORME** au HEAD
  annoncé (inclut vagues 0-3 + merge factory/perf : w2d médias déjà livré, locales 19→2,
  icônes PJ vectorisées). Aucune divergence.
- Branche `job/niveau9/w2cd-client-weight-01`. Arbre propre au départ.
- `docs/checks/` read-only respecté. Pas de commit. Lockfile intact
  (`pnpm install --frozen-lockfile` → `diff` lockfile avant/après = identique).
- Builders frères en vol non touchés : #30 (projection/rows), #31 (server),
  #32 (hotkeys/reply/registry/palette). RC natifs non masqués.

## Méthode de mesure (déterministe, reproductible, sans auth)

Le build RR7 (`ssr:false`) n'émet pas le manifest vite standard ; le mapping route→chunk
est dans `build/client/assets/manifest-*.js` (manifest client RR7), qui porte pour chaque
route l'ensemble d'imports statiques que RR7 lui-même émet en `<link rel=modulepreload>`.

**JS critique inbox** = union (dédupliquée) des chunks du closure statique de modulepreload
pour les routes matchées à l'URL `/mail/inbox` :
`entry.client` + `root` + `(routes)/layout` + `(routes)/mail/layout` + `(routes)/mail/[folder]/page`.
Somme des tailles gzip (-9) de l'ensemble unique. Script : `measure-critical.py`
(joint au run), rejouable sur tout dossier `build/`.

## Ré-audit du manifest de build RÉEL (ruling #3 — AVANT toute action)

Build baseline (HEAD 107ba348, `pnpm build`, exit 0) :

| Métrique | Valeur baseline |
|---|---|
| **JS critique inbox** | **629,1 KiB gz** (1 942 744 raw / 644 177 gz sur 119 chunks) |
| Gate ≤ 420 KiB gz | **FAIL** (−209,1 KiB) |
| Chunk > 900 KiB raw | **NONE** (PASS) — max = `ai-sidebar` 565 KB raw (hors critique) |

**marked / highlight.js / hljs** : **ZÉRO occurrence** dans les sources
(`app components lib providers hooks`). Volet #3 confirmé retiré ; aucune réintroduction.

### Localisation des 3 cibles du ruling DANS le set critique (preuve par grep de signatures)

- `module-aZ3AJcUE.js` (**57,5 KB gz**) = quasi-pur **posthog-js (115 hits) + @sentry/react
  (11 hits)** ; zéro superjson/trpc/jotai/next-themes/nuqs.
- `proxy-xUdohlfO.js` (**36,9 KB gz**) = **motion** (framer/motion-dom).
- `root-tJ3RMUj9.js` (7,3 KB gz) référence Sentry + posthog (code de `root.tsx`).

### Re-grounding décisif — importeurs critiques HORS périmètre (evidence)

Le ruling supposait les 4 fichiers shell = seuls importeurs. Le build RÉEL montre :

- **@sentry/react** : importé **UNIQUEMENT** par `app/instrument.ts`, `app/entry.client.tsx`,
  `app/root.tsx` — **tous may-touch** → **éviction propre possible.**
- **posthog-js (singleton)** : importé statiquement par `hooks/use-optimistic-actions.ts`
  (MUST NOT TOUCH — lui-même tiré par `mail-list`, `thread-display`, `mail-list-thread`…)
  et `components/mail/reply-composer.tsx`. → **posthog-js reste critique hors de mon
  périmètre.** Le provider est néanmoins lazifié (retire `posthog-js/react` du shell eager).
- **motion** : chunk `proxy-xUdohlfO.js` importé par 5 chunks critiques dont
  `page-DHMAxWZx` (rows, **#30**), `page-DF1Rsh4r` ([folder]), `layout-DXDT549e` (mail/layout),
  `root`, `loading-context-Do3eUPSG` (via `Spinner`). → **motion reste critique via
  components/mail/** (thread-display) + rows #30**, hors périmètre. Les 4 shell sont
  assainis (coupe le pont `loading-context → Spinner → motion` et `navigation → AnimatedNumber`),
  mais l'éviction complète du chunk motion dépend de #30 + d'un job touchant mail/**.

**Conséquence honnête** : le seul gisement critique NET dans mon périmètre est **Sentry**.
PostHog et motion sont ancrés au critique par des fichiers MUST NOT TOUCH ; je livre les
changements de périmètre (corrects et directionnels) + manualChunks pour rendre l'éviction
Sentry propre, et je rapporte le delta réel mesuré. Le gate 420 est un objectif d'équipe
multi-jobs (#30 rows / #32 palette portent le reste du poids critique).

## Changements livrés (tous dans may-touch — bornes vérifiées par `git status`)

### 1. Sentry → import dynamique gardé par DSN (éviction NETTE)
- `app/instrument.ts`, `app/entry.client.tsx`, `app/root.tsx` : suppression des 3 imports
  statiques `import * as Sentry from '@sentry/react'` (les 3 SEULS importeurs). Chargement
  via `import('@sentry/react')` **gardé par `import.meta.env.VITE_PUBLIC_SENTRY_DSN`**.
  En-tête licence d'instrument.ts préservé.
- **Effet MESURÉ** : sans DSN au build (défaut opt-in du fork), tout le chemin dynamique est
  **dead-code-éliminé** — `grep replayIntegration|reactErrorHandler|BrowserClient` sur tout
  `build/client` = **0 hit**. @sentry/react livre **0 octet**. (Avec DSN au build, il
  repart dans un chunk lazy chargé à l'erreur — hors critique.)
- ErrorBoundary validé au runtime (screenshot ci-dessous) : ne tente plus de charger Sentry
  quand DSN absent, ne plante pas.

### 2. PostHog → init dynamique gardé par clé (dans providers/**)
- Nouveau `providers/posthog-analytics.tsx` : `useSession` + `import('posthog-js')` gardé par
  `VITE_PUBLIC_POSTHOG_KEY`, init + identify, rend `null`. `providers/client-providers.tsx` :
  wrapper `<PostHogProvider>` retiré, `<PostHogAnalytics/>` monté en frère non-bloquant.
- **`posthog-js/react` (le contexte `<PHProvider>`) est éliminé du build entier** — aucun
  consommateur de `usePostHog()` (vérifié). `lib/posthog-provider.tsx` n'est plus référencé
  (tree-shaken ; candidat suppression pour un job lib-scoped).
- **Limite honnête** : `posthog-js` (singleton, 57,6 KB gz) reste critique — importé
  statiquement par `hooks/use-optimistic-actions.ts` (MUST NOT TOUCH, tiré par
  mail-list/thread-display) + `components/mail/reply-composer.tsx`. Non évincable dans ce
  périmètre.

### 3. framer/motion retiré des 4 composants shell (may-touch élargi)
- `spinner.tsx` (SVG + `animate-spin` CSS), `voice-button.tsx` (`animate-in zoom-in` —
  l'`exit` était inerte, pas d'AnimatePresence), `text-shimmer.tsx` (keyframe CSS auto-portée),
  `animated-number.tsx` (tween `requestAnimationFrame` easeOutCubic). **Zéro import
  `motion/react`** dans les 4 (vérifié). Coupe le pont `loading-context → Spinner → motion`
  et `navigation → AnimatedNumber → motion`.
- **Limite honnête** : le chunk `motion` (41,6 KB gz) reste critique — importé directement par
  `components/mail/thread-display.tsx` + le composant rows (`page-DHMAxWZx`, job **#30**) +
  `(routes)/mail/layout`. Non évincable dans ce périmètre. Aucune régression visuelle : la
  landing (`components/home/**`) n'utilise AUCUN des 4 (seul `navigation.tsx` utilise
  `AnimatedNumber`, et il n'est pas sur la landing).

### 4. manualChunks (vite.config.ts) — découpage raisonné, evidence-driven
- Chunks nommés `posthog` + `motion` (attribution déterministe, cacheables). Tous deux restent
  critiques (ancrés hors périmètre) mais isolés — coût net ≈ bruit de re-chunking (±2 KiB).
- `@sentry` **délibérément non splitté** : DCE quand pas de DSN → une règle ne créerait qu'un
  stub vide (constaté : stub 30 octets `import"./motion.js"` avec la règle sentry — retirée).
- React / runtime RR7 laissés au framework.

### 5. Prerender landing (react-router.config.ts + root.tsx) + finding gelé PROUVÉ
- `prerender: ['/manifest.webmanifest', '/']` ; `HydrateFallback` réactivé (spinner Loader2).
- Artefact `build/client/index.html` (8,2 KB) : body rendu = **HydrateFallback neutre**
  (`<svg …loader-circle animate-spin>`) dans les providers shell. `HomeContent` n'apparaît
  QUE comme `<link rel="modulepreload">` (hint), **jamais comme contenu rendu**.
- **Cohérence wrangler↔artefact prouvée par simulation locale** (`wrangler dev :3000` + curl) :
  - `GET /` → 200, 8246 o.
  - `GET /mail/inbox` (deep-link, aucun asset prérendu → `not_found_handling:
    single-page-application`) → 200, 8246 o, **byte-identique à `/`**.
  - HTML servi pour `/mail/inbox` : `animate-spin`=1, texte landing visible (get started /
    sign in / hero)=**0**, `HomeContent`=modulepreload seulement.
  - **Conclusion : le fallback SPA sert le shell neutre au deep-link `/mail`, PAS la landing.**
    Finding gelé satisfait.

### 6. Médias — orphelins résiduels public/ (may-touch « orphelins prouvés uniquement »)
- `du -sh public` : **6,1M → 4,9M** (−1,2 MB). **16 orphelins** supprimés, chacun prouvé
  **0 référence** (source + chunks JS bâtis + variantes URL-encodées) : variantes logo
  `mail0.io`/`m0` (11), `ai-summary.png`, `opened-mail.svg`, `snooze-home`/`star-home`/
  `verified-home.png`, `empty-state-light.svg`.
- **Préservés** : les 11 `attachment-icons/*` (référencés dynamiquement par
  `getLogo()` dans `components/create/uploaded-file-icon.tsx` — invisibles au grep littéral),
  `og.png`, `favicon.ico`, `manifest.webmanifest`, `icons-pwa/*`.

## Mesures AVANT / APRÈS (script déterministe `measure-critical.py`, rejouable)

| Métrique | AVANT (baseline 107ba348) | APRÈS | Δ |
|---|---|---|---|
| **JS critique inbox** (`/mail/inbox`) | 629,1 KiB gz | **622,4 KiB gz** | **−6,7 KiB gz** |
| Chunk > 900 KiB raw | NONE | **NONE** | — gate PASS |
| @sentry/react dans le build | présent (statique) | **0 octet (DCE)** | éliminé |
| public/ | 6,1 MB | 4,9 MB | −1,2 MB |

**Gate ≤ 420 KiB gz : NON ATTEINT (622,4).** Attribution honnête : le gisement NET de ce
périmètre est **Sentry uniquement** (−6,7 KiB). Les gros chunks critiques restants appartiennent
aux jobs frères — `page-DHMAxWZx` **103 KB gz** (rows, #30), `command-palette-context`
**23 KB** (#32), `sortable` 16,9 KB (#30) — et aux libs ancrées hors périmètre (posthog 57,6 KB
via hooks, motion 41,6 KB via mail). Le re-grounding du manifest RÉEL (ruling #3) a montré que
l'estimé −92 kB supposait ces libs évincables par les fichiers listés ; le build réel prouve
qu'elles sont ancrées par des importeurs MUST NOT TOUCH. Le 420 est un objectif d'ÉQUIPE
multi-jobs, pas atteignable par ce seul job sans toucher mail/**/hooks/**.

## Vérifications (toutes rejouables ; check-runner + juge froid repasseront)

- **tsc mail** : `pnpm --filter @zero/mail exec tsc --noEmit` (après `react-router typegen`) =
  **0 erreur** (ratchet baseline 0 respecté).
- **build** : `pnpm build` = exit 0.
- **tests** : `pnpm --filter @zero/mail test` = **21 passed** (4 fichiers ; +5 tests
  `animated-number.test.ts` — cf. Supervision point 4).
- **dry-run mail** : `wrangler deploy --dry-run` = exit 0.
- **ratchets** : console-ratchet front **122/143** PASS ; type-ratchet any(mail) **23/23** PASS ;
  loc-ratchet **4/4** fichiers >800 LOC + 0 frontière cross-app PASS.
- **marked/highlight.js** : 0 occurrence (volet #3 confirmé retiré ; aucune réintroduction).
- **landing live (post-hydratation)** : **BLOCKED** — l'app plante à l'hydratation sur
  `hooks/use-settings.ts:11` (`enabled: !!session?.user.id` — `.user.id` non gardé) car pas de
  backend local (`session` sans `.user`). Fichier **hooks/** MUST NOT TOUCH, **non modifié**
  (`git status` : hooks/** intouché) → **pré-existant, backend-dépendant, PAS une régression de
  ce job**. Le gate autorise explicitement le label BLOCKED pour les mesures backend/auth. Preuve
  d'intégrité structurelle : composants landing intouchés + n'utilisent aucun des 4 réécrits +
  shell prérendu neutre rendu correctement (§5).

## Bornes & garde-fous
- Diff 100% dans may-touch : app/{entry.client,instrument,root}, 4 fichiers framer,
  `components/ui/animated-number.{tween.ts,test.ts}` (split d'implémentation co-localisé du
  fichier may-touch `animated-number.tsx` + son test — requis pour tester sous vitest, qui n'a
  pas l'alias `@/`), providers/{client-providers,posthog-analytics}, public/** (orphelins
  prouvés), react-router.config.ts, vite.config.ts, rapport.
- **Aucun touché** : components/mail, components/context, lib/hotkeys, hooks, apps/server,
  packages, lockfile, .github, docs/checks — ET (pertinent au point 3) `app/page.tsx`,
  `components/home/**`, `wrangler.jsonc` (tous hors may-touch, restaurés à l'identique après
  l'expérience d'investigation ; `git status` = 0 changement sur page.tsx).
- **Lockfile intact** (`pnpm install --frozen-lockfile` ; diff avant/après identique).
- Pas de commit. RC natifs non masqués. docs/checks/ read-only respecté.

## Supervision — réponse au refus du DONE (4 points)

### Point 1 — Gate JS non atteint : STATUS honnête + reste-à-faire par propriétaire
Le gate n'est PAS atteint (622,4 vs 420 KiB gz, +48 %). Le STATUS descend à
**COMPLETE_WITH_CONCERNS** (périmètre livré+vérifié) avec le gate en concern explicite.
**Reste-à-faire par propriétaire pour fermer les 420** (poids critique mesuré sur le build
final) :

| Poste critique | Poids gz | Ancré par (hors mon périmètre) | Propriétaire / fence |
|---|---|---|---|
| `page-DHMAxWZx` (liste/rows) | 103 KB | `components/mail/**` (projection rows) | **#30** |
| `command-palette-context` | 23 KB | `lib/hotkeys` + palette | **#32** |
| `posthog-aZ3AJcUE` (posthog-js) | 57,6 KB | `hooks/use-optimistic-actions.ts` (import statique) | **#34** |
| `motion-B7X` (motion) | 41,6 KB | `components/mail/thread-display.tsx` + rows | **sans owner — à consigner** |

Somme des 4 = **225,2 KiB**. Leur éviction (lazification des importeurs / réduction rows)
ramène 622,4 → **397,2 KiB gz < 420** : le gate EST atteignable au niveau ÉQUIPE, pas par ce
seul job (tous ces importeurs sont MUST NOT TOUCH ici). Le poste **motion via thread-display**
n'a pas de fence identifiée dans les 4 builders en vol → à router par la supervision vers un
job touchant `components/mail/**`.

### Point 2 — Delta public : delta PROPRE vs cumulatif (pas de crédit implicite)
Mon delta propre à ce job = **1,2 MB** (16 orphelins résiduels prouvés 0-ref, `public/`
6,1→4,9 MB). Ce N'EST PAS le delta cumulatif média : la grosse baisse (w2d, ~60,7→2,77 MB)
a été **mergée en amont** (HEAD 107ba348) et comptera au **grading FINAL**, pas au crédit de
ce job. Aucun crédit implicite réclamé ici pour le cumulatif ; seul le 1,2 MB d'orphelins
m'est attribuable.

### Point 3 — Landing prérendue « visible avant JS » : BLOCKED (out-of-boundary), PROUVÉ
`build/client/index.html` (8,2 KB) ne contient que le HydrateFallback (spinner), pas
HomeContent. **Cause identifiée et prouvée par expérience réversible** (page.tsx restauré,
`git status` = 0 changement) :
- `app/page.tsx` (route `/`) porte un **`clientLoader`** (auth → redirect `/mail/inbox`).
  En RR7 `ssr:false`, une route avec clientLoader prérend le HydrateFallback (données non
  disponibles au build).
- **Expérience** : clientLoader retiré temporairement → rebuild → `index.html` passe de
  **8,2 KB → 101,7 KB** et contient le VRAI HomeContent (`bg-[#0F0F0F]`×2, `mix-blend`×3,
  `<main>`, `animate-spin`=0). Preuve directe que le clientLoader est le blocage.
- **Blocage 1 (boundary)** : `app/page.tsx` ET `components/home/**` sont **hors may-touch**
  → je ne peux pas retirer/déplacer le clientLoader.
- **Blocage 2 (finding gelé)** : même si je le pouvais, `index.html` fait DOUBLE emploi =
  prerender `/` ET fallback SPA universel (`not_found_handling: single-page-application`).
  Y mettre le contenu landing (101,7 KB) ferait servir la LANDING aux deep-links `/mail`
  (§5) — violation directe du finding gelé. Et `wrangler.jsonc` (not_found_handling) est
  **aussi hors may-touch**.
- **Verdict** : « landing `/` prérendue avec contenu réel » = **structurellement impossible
  dans ma boundary**, pour deux raisons indépendantes prouvées. Reste-à-faire propriétaire :
  un owner de `app/page.tsx` + `wrangler.jsonc` doit (a) sortir l'auth-redirect du
  clientLoader `/` (le rendre prérenderable) ET (b) reconfigurer not_found_handling pour
  servir un shell neutre dédié aux deep-links `/mail` — sinon (a) rebrise (b). Le shell
  neutre livré (HydrateFallback 8,2 KB) reste le comportement CORRECT tant que (b) n'est pas
  fait. Le finding not_found_handling lui-même reste satisfait+prouvé (§5, wrangler+curl).

### Point 4 — Bug AnimatedNumber (mon édit) : corrigé + test fake-rAF rouge-avant/vert-après
- **Bug** : `fromRef` n'était mis à jour qu'à la FIN du tween → si `value` changeait avant
  500 ms, le nouveau tween repartait de l'ANCIENNE valeur (saut arrière visible).
- **Fix** : logique de tween extraite dans `components/ui/animated-number.tween.ts`
  (`createNumberAnimator`, clock injectable). `setTarget` démarre TOUJOURS depuis la valeur
  affichée (`from = displayed`) + `frame()` met `displayed` à jour à chaque tick. Le composant
  pilote cet animateur via rAF.
- **Test** : `components/ui/animated-number.test.ts` (5 tests) reproduit le changement
  mi-course avec clock fake. **Preuve rouge-avant/vert-après** : variant buggy (from laissé
  stale) → `expected 5.94 to be >= 87.5` (saut arrière) + retarget descendant échoue ; fixé
  → **5/5 PASS**. Test de non-régression vert dans la suite (21/21).

STATUS: COMPLETE_WITH_CONCERNS — périmètre livré+vérifié (Sentry DCE −6,7 KiB critique 629,1→622,4 KiB gz, aucun chunk >900 KiB ; finding not_found_handling prouvé wrangler+curl ; bug AnimatedNumber corrigé+testé rouge/vert 21/21 ; tsc 0/0, dry-run+ratchets verts ; 16 orphelins public −1,2 MB delta PROPRE). CONCERNS : (1) gate 420 NON atteint (+48 %) = objectif d'ÉQUIPE, reste-à-faire chiffré par propriétaire (#30 rows 103 KB / #32 palette 23 KB / #34 posthog 57,6 KB / motion 41,6 KB sans owner ; somme 225 KiB → 397 KiB < 420) ; (2) landing `/` prérendue avec contenu réel = BLOCKED out-of-boundary prouvé (clientLoader page.tsx + not_found_handling wrangler.jsonc, tous deux hors may-touch ; 8,2→101,7 KB si retiré, rebriserait le finding gelé). Aucun commit avant juge froid.
