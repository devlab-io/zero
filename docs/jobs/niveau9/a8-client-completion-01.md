# a8-client-completion-01 — [niveau9] Gate A8 : JS critique inbox ≤420 KiB gz (porteur NOMINAL, issue #44)

MIRROR: ORCHESTRATOR. Branche `job/niveau9/a8-client-completion-01`.
Ce job ATTERRIT ce que #33 (poids/landing) et #31 (cold-start) ont PROUVÉ mais ne pouvaient
toucher : leurs murs de boundary sont exactement mon périmètre élargi.

## PHASE 0 — Intégrité worktree (grounding)

- Worktree : `/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/a8-client-completion-01`
- `git rev-parse HEAD` = `453c6ef37e72026a2de89443f983989c4e74379b` → **CONFORME** au gel annoncé.
- Branche = `job/niveau9/a8-client-completion-01`. Arbre propre au départ.
- `scripts/checks/measure-critical.py` présent ; `docs/jobs/niveau9/a8-client-completion-01-rulings.md` présent.
- Env : worktree vierge → `pnpm install --frozen-lockfile` FRAIS (exit 0). Lockfile intact
  (shasum identique avant/après ; `git status` = 0 sur pnpm-lock.yaml). RC natif, non masqué.
- `docs/checks/**` read-only. `messages/**` + `project.inlang/**` = #38, INTERDITS.

## MESURES BASELINE (gel 453c6ef, build natif frais)

### JS critique inbox — `python3 scripts/checks/measure-critical.py apps/mail`
| Métrique | Baseline | Gate |
|---|---|---|
| **JS critique inbox** (`/mail/inbox`) | **628,2 KiB gz** (643 317 octets gz / 1 942 425 raw, 117 chunks) | ≤ 420 KiB (430 080 o) → **FAIL −208,2 KiB** |
| Chunk > 900 KiB raw (build entier) | **NONE** (PASS) | aucun >900 |

Ventilation critique (top, gz) — mes 4 cibles poids :
| Chunk | gz | Cible |
|---|---|---|
| `page-C0UKwSgw.js` (rows/[folder] + `components/mail/mail.tsx`) | **105,7 KB** | #4 dead-weight |
| `entry.client` (framework) | 58,0 KB | — (laissé) |
| `posthog-aZ3AJcUE.js` (posthog-js) | **57,5 KB** | #2 lazy posthog |
| `motion-B7X.js` (motion) | **41,5 KB** | #1 lazy motion |
| `chunk-KS7C4IRE.js` (vendor à identifier) | 40,9 KB | via #4 |
| `command-palette-context.js` | **23,4 KB** | #3 lazy-mount |
| query-provider 19,7 / utils 19,7 / app-sidebar 17,6 / sortable 16,9 (dnd) / calendar 12,5 / types 12,2 … | | #4 |

Éviction nette additive attendue : motion 41,5 + posthog 57,5 + palette ~20 = ~119 → ~509 KiB.
Le solde (~90 KiB) DOIT venir de #4 (rows) : lazifier thread-display(motion)/palette suffit à
retirer motion+palette du chunk mail, + lazification des panneaux lourds (calendar, dnd) hors du
chunk route initial. Objectif atteignable au niveau ce job (contrairement à #33 borné hors mail/hooks).

### Cold-start serveur — harnais R10 (wrangler dev LOCAL, `--env local`, port 8787)
| Métrique | Baseline |
|---|---|
| R10 `/` (2 warmups + 10 iter), warm | **médiane 214,1 ms** (min 189,1 / max 304,9 / σ 38,0 ms) |
| 1re requête post-boot (cold-ish) | ~399 ms (status 500 : bindings/DB locaux absents — latence de chemin, pas health) |
| Bundle serveur `wrangler deploy --dry-run --env local` | **21 940,54 KiB / gzip 2 756,17 KiB** |

**Caveat honnête (concur. #31)** : la R10 warm est dominée par l'overhead dev-proxy wrangler, PAS
par l'éval de module au cold-start. Le proxy DÉTERMINISTE du coût cold-start est la taille du bundle
éval-au-démarrage : je rapporte le delta bundle dry-run + R10 avant/après. AUCUN deploy.

### tsc (ratchet baseline) — **0/0 CONFIRMÉ** via séquence de génération EXACTE
Séquence (RC natifs, dans l'ordre, RULING orchestrateur) :
1. `pnpm install --frozen-lockfile --ignore-scripts` (exit 0)
2. `pnpm --filter @zero/server types` (worker-configuration.d.ts écrit)
3. `pnpm --filter @zero/mail types` (worker-configuration.d.ts écrit — **étape clé**)
4. `pnpm --filter @zero/mail exec react-router typegen` (0 errors, paraglide compile)
5. `pnpm --filter @zero/server exec tsc --noEmit` → **0 erreur**
6. `pnpm --filter @zero/mail exec tsc --noEmit` → **0 erreur**

Baseline = **server 0 / mail 0**. Mon annonce initiale « mail tsc=2 » était un FAUX PLANCHER : j'avais
sauté l'étape 3 (`@zero/mail types`), d'où les fantômes `lib/server-tool.ts` TS2558 + `server/src/types.ts`
TS2304 'Env' (artefact codegen classique, cf. précédent #42-01). Corrigé. Gate = candidat AUSSI à 0/0.
Snapshot boundary committé intact (git status propre ; jamais régénéré — cf. finding #1).
- tests : 301 au gel (annoncé team-lead) — cible : rester vert.

## DÉSACCORDS / FINDINGS (fichiers cités)

1. **Piège gen-trpc-boundary** — `apps/server/scripts/gen-trpc-boundary.mjs` RÉÉCRIT le fichier
   SUIVI `apps/server/src/trpc/app-router.boundary.d.ts`, et sa sortie DIVERGE du snapshot committé
   (→ 2 fausses erreurs tsc dans `boundary.test-d.ts`). Le snapshot committé est la vérité.
   **Décision : ne JAMAIS régénérer le boundary** ; je le restaure si un outil le touche.

2. **Landing « impossible » de #33 est SOLVABLE** — #33 (rapport w2cd §Point 3) conclut que la
   landing prérendue réelle est « structurellement impossible » car `index.html` fait double emploi
   (prerender `/` + fallback SPA universel). **Or le build RR7 émet DÉJÀ un fichier fallback SÉPARÉ** :
   la sortie build montre `/ -> build/client/index.html` ET `SPA Fallback -> build/client/__spa-fallback.html`.
   Le shell neutre existe donc indépendamment. Reste à router le not-found CF vers `__spa-fallback.html`
   au lieu d'`index.html`. Levier prouvé empiriquement (build + curl) avant écriture. #33 était borné
   hors `app/page.tsx`+`wrangler.jsonc` ; moi non. Approche validée par expérience réversible.

3. **Cold-start warm-R10** — concur. #31 (w2f §3b) : la R10 warm ≈ bruit dev-proxy. J'ajoute le
   delta bundle dry-run (déterministe) comme evidence principale du gain d'éval au démarrage.

## PLAN (par cible, mesure après chacune — libellé HONNÊTE : chiffre mesuré = chiffre annoncé)

**Poids (NOMINAL) — imports lazy UNIQUEMENT, comportement inchangé :**
- **#1 motion** — `components/mail/thread-display.tsx` importe `motion/react` en statique (l.36),
  usage conditionnel `animationsEnabled` (l.504-558). → extraire le wrapper animé dans un sibling
  `thread-display.animated-message-list.tsx` `React.lazy()` + Suspense(fallback = MessageList nu) +
  préchargement au montage si animations activées (zéro flash). motion quitte le closure critique.
- **#2 posthog** — `hooks/use-optimistic-actions.ts` l.14 `import posthog from 'posthog-js'`, 1 seul
  usage l.137 (fire-and-forget). → `void import('posthog-js').then(({default})=>posthog.capture(...))`.
  Singleton partagé avec l'init lazy de #33 (providers/posthog-analytics). Sémantique préservée.
- **#3 palette** — `components/context/command-palette-context.tsx` importe statiquement les vues
  lourdes (views 20K, filter-view 13K, cmdk, date-fns) rendues seulement à l'ouverture. → provider
  léger eager (state `activeFilters`/`clearAllFilters` + effet storage init + listener ⌘K), dialogue
  lourd extrait dans un sibling `command-palette-dialog.tsx` `React.lazy()` monté au 1er open.
  Contexte identique pour nav-main/mail (consommateurs). Comportement inchangé.
- **#4 rows** — `page-C0UKwSgw.js` = `components/mail/mail.tsx` (849 l.) pulls ThreadDisplay(#1),
  useCommandPalette(#3), + panneaux lourds. #1+#3 retirent motion+palette de ce chunk ; reste à
  lazifier les dépendances lourdes non-critiques au 1er rendu inbox (calendar, dnd/sortable) sans
  changer le comportement. Mesure pilote la profondeur.

**Landing (#5)** — `app/page.tsx` : sortir l'auth-redirect du `clientLoader` (cause prouvée #33) →
`/` prérend le vrai HomeContent dans `index.html`. Router le fallback SPA CF vers `__spa-fallback.html`
(shell neutre) via `wrangler.jsonc` (preuve curl `/` ET `/mail/inbox` avant/après ; deep-link ≠ landing).

**Cold-start (#6)** — lazifier les imports IA lourds (`ai`/`@ai-sdk/*`/openai/groq) au TOP de
`routes/agent/**` + `trpc/routes/ai/**` vers `await import()` DANS les méthodes chaudes (zéro
changement de logique ; classes DO restent exportées statiquement en main.ts — contrainte Workers).
Retrait du wrapper 60s redondant : `lib/gmail-rate-limit.ts` (`Schedule.addDelay(60s)`) +
`routes/agent/sync-worker.ts` (rendu obsolète par le backoff transport #31). Harnais R10 + bundle avant/après.

## Séquence
0. PHASE 0 (ce doc) ✔  1. #1 #2 (clean) + mesure  2. #3 palette + mesure  3. #4 rows + mesure
4. #5 landing + preuve curl  5. #6 cold-start + R10  6. Vérifs (tsc/tests/build/dry-run×2/ratchets/agent-surface)
7. Rapport STATUS + STAND-DOWN.

## PROGRESSION MESURÉE (mise à jour au fil de l'eau)

### FINDING SCOPE (mesuré, escaladé — attente ruling A/B)
Les anchors critiques dominants sont HORS may-touch littéral. Preuve grep chunks+manifest :
- **motion (41,5 KB)** : lazifié dans thread-display (édit correct+préchargé) → MESURE 628,2→628,5 = AUCUN
  delta. Ancré par `components/ui/app-sidebar.tsx` (icônes animées sun/moon/square-pen via
  nav-user/theme-toggle → motion/react) + `app/entry.client.tsx`. Hors may-touch.
- **posthog (57,5 KB)** : lazifié use-optimistic-actions + reply-composer lazy dans thread-display*
  (les 2). reply-composer + use-optimistic-actions ONT quitté le critique (chunks séparés vérifiés).
  Mais posthog reste, ancré par `components/ui/app-sidebar.tsx → components/create/create-email.tsx
  → import posthog`. Hors may-touch. MESURE après #1+#2 : **627,3 KiB gz**.
- **rows page (~105 KB)** = `components/mail/mail.tsx` (route [folder]/page). Hors may-touch.
- **chunk-KS7C4IRE (40,9 KB)** = code app minifié, hors may-touch.
Plancher within-boundary (après palette #3, seul gain restant ~23 KiB) ≈ **604 KiB**. Gate 420
NON fermable dans la boundary littérale. Ruling demandé : (A) expansion vers app-sidebar.tsx +
create-email.tsx + mail.tsx + icônes animées ; (B) accepter plancher COMPLETE_WITH_CONCERNS.

### #5 LANDING — RÉSOLU + PROUVÉ (réfute « impossible » de #33)
- `app/page.tsx` : auth-redirect sorti du clientLoader → effet post-hydratation (rend `/`
  prérenderable ; logged-in→/mail/inbox préservé, client-side). Trade-off honnête : logged-in voit
  une frame de landing avant redirect (au lieu d'une frame de spinner) — inhérent au prerender.
- `workers/spa-fallback.ts` (nouveau) + `wrangler.jsonc` : `main` worker + `assets.binding: ASSETS`
  + `not_found_handling: none`. Assets existants servis tels quels ; nav sans asset → __spa-fallback.html
  AU MÊME URL (200, pas de redirect). Type ASSETS auto-suffisant (pas de dép @cloudflare/workers-types).
- PREUVE CURL (wrangler dev, build propre — `.wrangler` vidé, sinon deploy-config stale) :
  `/`→200 landing 101 761 o (bg-[#0F0F0F]×2, `<main>`, animate-spin=0) ;
  `/mail/inbox`→200 shell NEUTRE 6 061 o (animate-spin=1, landing=0) ; `/mail/sent`→neutre ;
  `/assets/*`→200. index.html contient HomeContent (grep ✓). Finding gelé PRÉSERVÉ.
- Mécanisme testé et écarté : `_redirects` (wrangler assets fait un 307 redirect, pas un rewrite 200 —
  mangle l'URL via force-trailing-slash → casse le routing SPA). Le worker+binding est la voie propre.
- NB #38/root.tsx : je n'ai PAS eu besoin d'éditer root.tsx pour la landing → le delta de consommation
  des clés ErrorBoundary #38 revient à l'orchestrateur (signalé).

### #6a — wrapper 60s retiré (cold-start / hot-path)
- `routes/agent/sync-worker.ts` : `withRetry(rateLimitSchedule 60s)` retiré du `driver.get` de syncThread.
- `lib/gmail-rate-limit.ts` SUPPRIMÉ (mort : classifieur isRateLimit mirroré dans gmail-backoff.ts #31,
  zéro importeur restant hors commentaires). Non-régression : le wrapper ne retentait que sur erreurs
  Gmail rate-limit — couvertes par le backoff transport #31 (Gmail), NO-OP non-Gmail (recurWhile stop).
- server tsc = 0.

### #3 PALETTE — lazifié (within-boundary), MESURÉ
`components/context/command-palette-context.tsx` : les 5 vues (MainView/SearchView/LabelsView/
HelpView + FilterView avec son calendrier react-day-picker) rendues seulement à l'ouverture →
`React.lazy` + Suspense. MESURE : command-palette-context 23,4→19,4 KB gz + calendar évincé du
critique. TOTAL 627,3 → **611,8 KiB gz** (−15,5). Le résidu 19,4 KB = logique context + date-fns +
cmdk (éviction plus profonde = split provider/dialog risqué pour ~19 KB, ne ferme pas le gate → non
fait). 113 tests mail verts (command-registry inclus), tsc 0.

### PLANCHER WITHIN-BOUNDARY CONFIRMÉ : **611,8 KiB gz** (baseline 628,2, −16,4)
Tout l'extractible dans ma boundary est extrait. motion(41,5)+posthog(57,5) restent (ancrés
app-sidebar/create-email hors may-touch) ; rows(~105)+KS7C4IRE(40,9) hors may-touch. Gate 420
NON atteignable sans expansion (A). Reste −191,8.

### #6b lazy-IA cold-start — VERIFIED-NO-OP (ruling orchestrateur ; AUCUN refactor)
Décision : livraison en **verified-no-op documenté**, PAS de refactor des 7 fichiers. Dossier structurel :
1. **Contrainte Workers** : les chaînes IA entrent au cold-start via les CLASSES DO exportées
   STATIQUEMENT par `main.ts` (ZeroAgent/ZeroMCP/ZeroDriver de routes/agent, ThreadSyncWorker) — le
   runtime Workers exige ces exports statiques. Lazifier les imports IA des routers (aiRouter/appRouter)
   ne retire pas l'IA du graphe d'init car les classes DO la tirent quand même (prouvé par #31, w2f §3b).
2. **Bénéfice non chiffrable** : le harnais R10 prescrit (wrangler dev warm) ≈ bruit dev-proxy ; le
   deploy-total dry-run ne bouge pas (les chunks lazy restent uploadés). Aucun gain mesurable à annoncer.
3. **Agent non testable runtime** : pas de clés IA ; wrangler dev /health 500. Un refactor 7-fichiers
   serait du churn non vérifiable sans preuve de gain.
Faisabilité VÉRIFIÉE (les factories/tool()/streamText sont function-scoped → lazification
mécaniquement possible) mais NON RETENUE. **Zéro revendication de gain.** #6a (retrait wrapper 60s) EST
livré et mesuré séparément (bundle serveur 2756,17→2743,25 KiB).

### tsc courant : mail 0 / server 0. Build mail exit 0. 301 tests (mail 113 + server 188). Tous ratchets/agent-surface/dry-run×2 verts.

## POST-REBASE #38 (base f143abf9) — progrès & corrections superviseur

### Rebase #38 (procédure stash c10fe16a)
Inventaire capturé → `git stash push -u` → fetch → rebase origin/factory/niveau9 (fast-forward,
0 commit local) → `git stash pop` EXIT 0 ZÉRO conflit → non-perte vérifiée (porcelain==inventaire ;
`merge-base --is-ancestor c5259dab HEAD`=YES ; #38 n'a touché AUCUN de mes 9 fichiers ; lockfile
inchangé ; boundary.d.ts intact) → baseline re-mesurée **tsc 0/0**, critique 552,2 KiB gz.

### posthog ÉVINCÉ (via app-sidebar) — MESURÉ −60
`components/ui/app-sidebar.tsx` : `CreateEmail` (import statique → create-email → posthog) rendu
`React.lazy` dans le `<DialogContent>` compose (rendu seulement à l'ouverture) + preload sur INTENTION
(pointerenter/focus du bouton compose, PAS au montage). create-email.tsx non édité. 611,8 → **551,3**.
create-email.tsx (différé #38) devient INUTILE : posthog déjà évincé par cette voie.

### Corrections audit superviseur (post-rebase)
- **Worker (239826ff)** : garde nav stricte (GET/HEAD + Accept text/html ou Sec-Fetch-Mode navigate,
  sinon 404 original) ; `!shell.ok` → retourne la réponse SHELL (erreur réelle) ; HEAD → body null.
  5 preuves curl (a-e) vertes, build propre.
- **Preload metric-gaming (f143abf9)** : tous les preloads-au-montage SUPPRIMÉS. create-email→intention ;
  motion+reply-composer→Suspense seul. Mesure inchangée après suppression → éviction STRUCTURELLE.
- **Overclaims purgés** : « never flash / no visible delay / instant / byte-for-byte / identical /
  no behaviour change » → formulations littérales dans les 5 fichiers.
- **Palette** : fallback `null` → spinner minimal centré ; commentaire honnête (1re ouverture froide).
- **Motion fallback structurel (QA #1)** : constant partagé `THREAD_TRANSITION_WRAPPER_CLASS`
  (module motion-free `thread-display.transition.ts`) + test `thread-display.transition.test.ts` (3 tests).
- **root.tsx** : 5 clés #38 `pages.error.boundary.*` consommées (oops/error/notFoundDetails/
  somethingWentWrong/seeConsole). tsc 0.

### CONSTAT DE FAISABILITÉ — gate 420 hors de portée LÉGITIME (règle anti-metric-gaming)
L'arithmétique du plafond suppose route −100,7 (rows page 104→~4). Or `page-*` (104 KB) = chunk route
de `mail.tsx` = UI TOUJOURS RENDUE au load inbox (MailList liste+virtua+dnd, ThreadDisplay empty-state
+ toolbar, barre compose). Les lazifier = metric-gaming (le chunk charge au load inbox de toute façon).
Réduction LÉGITIME du rows = features réellement différées (dialogs conditionnels) = marginale.
**Plancher legit mesuré = 552,4 KiB gz.** Dernier levier poids legit = motion 41,5 (→~510, nécessite
réécriture CSS des 3 icônes sun/moon/square-pen + lazy AddConnectionDialog dans nav-user) — n'atteint
PAS 420. « gate atteint » non annonçable sous la règle. Ruling A(motion→510)/B(acter 552) demandé.

## ÉTAT FINAL — 628,2 → **435,9 KiB gz** (best antérieur 435,7 ; +0,1 = coût du seam testable ComposeSurface/PricingTrialButton)

**Gate poids A8 : FAIL — 435,9 KiB vs ≤420 (écart 15,9).** (Jamais « tous gates verts » : le gate poids
est un gate et reste FAIL tant que >420. Gates fonctionnels/structurels verts ; gate poids A8 FAIL.)

### Preuves candidature (SUBSTITUT ; rendu navigateur authentifié + trace réseau cold-inbox ROUTÉS #40 — CORS localhost bloque l'app locale, pas de contournement)
- **Triggers réels** `app-sidebar.triggers.test.tsx` (3, OPTION A structurelle, SANS user-event — cf.
  Relève -02) : vrais `ComposeButton` + `PricingTrialButton` exportés ; **clic souris RÉEL** (MouseEvent
  'click' natif dispatché, aucune dep) → `useQueryState` → 'true' → factory import **0→>0** (compteur,
  assertion FROIDE stricte) → fallback accessible → final après resolve ; assertion structurelle
  `btn.tagName === 'BUTTON'` (chaque trigger est un `<button>` natif, donc Enter/Space-activable par un
  vrai navigateur). Enter/Space NATIFS **ROUTÉS #40** : la sonde happy-dom `CLICKS_AFTER_ENTER=0` prouve
  que l'environnement ne synthétise aucun clic d'activation clavier — le chemin réel est routé au bench #40.
- **Icônes restart** `icon-restart.test.tsx` (3, Moon/Sun/SquarePen) : 2× startAnimation → 2 remounts
  distincts de l'élément animé (runId key) = restart répétable prouvé (le handle impératif préservé).
- **Fermeture statique** (python, exit 0, stderr vide) : `__spa-fallback.html` (cold /mail/inbox) = 0
  chunk cible (motion/thread-display/pricing/email-composer/command-palette-dialog/reply-composer/
  posthog/create-email) ; edges DYNAMIQUES prouvés (app-sidebar→create-email, palette-context→dialog,
  thread-display→reply-composer/animated-message-list, page→thread-display/pricing). index.html (landing
  `/`) précharge motion = motion PROPRE de la landing (components/home/**), page ≠ /mail/inbox, hors A8.
  Finding 6ee8f65f RÉSOLU : split React/motion (vite manualChunks) → le shell précharge React (séparé),
  PAS motion ; le chunk motion importe react (séparés).
- **Worker** : test 6 cas (shell 500→forwards 500) + preuve physique (mv trap-restore, /mail/inbox 404,
  / 200, shasum match).

### Réductions légitimes (mesure gelée par cible ; zéro preload-au-montage)
posthog −60 (app-sidebar lazy CreateEmail, preload hover/focus) · palette views −15,5 ·
**motion −39,4** (icônes+connection/add motion→CSS + split React/motion vite) ·
**reader ThreadDisplay −58,5** (ThreadEmptyState eager + reader lazy-sur-threadId) ·
PricingDialog −4 (conditionnel) · **palette-deep −15,4** (provider léger eager + dialog lazy-mount).
Extraction `mail-lazy-surfaces.tsx` (ThreadReaderSurface/PricingDialogSurface) → mail.tsx 850<852 loc.

**Gate poids A8 : FAIL — 435,9 KiB vs ≤420 (écart 15,9) — documenté.**

### ANALYSE D'IMPOSSIBILITÉ LÉGITIME + VENTILATION PAR PROPRIÉTAIRE (pièce jugement A8)
L'écart de 15,9 KiB N'EST PAS un défaut d'exécution : il est STRUCTUREL. Le résidu critique après
toutes les évictions légitimes est de l'infrastructure TOUJOURS RENDUE au load inbox ou du cœur
framework — le lazifier serait le metric-gaming interdit par f143abf9 (chunk chargé au load froid de
toute façon, la métrique baisse sans réduire les octets réseau réels).

| Chunk résidu critique | gz | Nature | Réductible ? / propriétaire |
|---|---|---|---|
| react-* | 84 | React 19 runtime | NON — cœur framework |
| chunk-KS7C4IRE | 40,9 | React Router 7.18 history (importé par entry.client+root+toutes routes) | NON — cœur router (identifié e042b369) |
| page-mail-core | ~39 | mail.tsx + MailList (liste toujours-rendue) | metric-gaming — refonte data-layer liste hors may-touch |
| query-provider / utils / types | ~52 | TanStack Query + utils + schémas partagés | NON — infra partagée toujours-rendue |
| app-sidebar-core | ~18 | shell sidebar (NavMain/NavUser toujours-rendus) | metric-gaming — hors may-touch (nav-user) |

Fermer 420 exigerait de réduire l'INFRA CORE (react/RR7/query-provider) — hors périmètre de ce job
(critique droite, jurisprudence #20→#25→#43, remontée faite) — OU une redéfinition de la mesure/gate
(hors périmètre, escaladée). **Libellé honnête : gate 420 NON atteint ; plancher légitime 435,9 KiB ;
l'écart est STRUCTUREL (UI toujours-rendue + cœur framework), pas un défaut d'exécution.**

DETTES ROUTÉES #40 (env local ne peut les produire) : rendu navigateur authentifié (session login
propriétaire interactif) + trace réseau cold-inbox loggée (CORS localhost bloque get-session/autumn ;
aucun contournement cookie/proxy autorisé). Le SUBSTITUT (tests rendu réels + fermeture statique
assertive) couvre le déterministe local.

### Preuves
- **Palette-deep** : `command-palette-context.test.tsx` (6 tests, createRoot+act, mock dialog
  suspendable vi.hoisted) — 5 contrats + fallback Escape (ASSERT modal PRESENT puis Escape→absent),
  stderr vide.
- **Worker SPA-fallback** : `workers/spa-fallback.test.ts` (6 cas : shell sain→200, **shell 500→
  forwards 500**, shell 404→404, non-nav→404, POST→404, HEAD→200 no-body) + preuve physique
  (trap restore : shell retiré → /mail/inbox 404, / 200, shasum avant/après MATCH).
- **Surfaces lazy** : `mail-lazy-surfaces.test.tsx` (5 tests) — montage conditionnel (chunk non
  fetché au repos) + fallback accessible PRESENT pendant load puis composant final.
- **Motion transition** : `thread-display.transition.test.ts` (3 tests) fallback structurellement équiv.

tsc server 0 / mail 0 · 133 tests mail + 188 serveur · console/loc/type-ratchet · agent-surface · build 0.

## POST-104774fa — historique intermédiaire : 628,2 → 450,7 KiB gz (−177,5)

Ruling factory 104774fa a débloqué les leviers légitimes (connection/add motion→CSS, split
ThreadEmptyState/reader, React/motion vite). Réductions MESURÉES, toutes légitimes (aucun
preload-au-montage ; chargement sur intention explicite ou ouverture réelle) :

| Cible | Levier | Δ | Cumul |
|---|---|---|---|
| posthog | app-sidebar lazy CreateEmail (preload hover/focus du bouton compose) | −60 | 568,2→508 (approx) |
| palette views | React.lazy des 5 vues (spinner fallback) | −15,5 | |
| **motion** | 3 icônes sun/moon/square-pen motion→CSS (keyframe self-contained, restart via runId+key) + connection/add motion→CSS (translate≠transform, prefers-reduced-motion) + split React/motion vite | **−39,4** | 552→513 |
| **rows reader** | split `ThreadEmptyState` eager (fidèle) + `ThreadDisplay` lazy-mount SEULEMENT si threadId (fallback spinner) — page 104→39,6 | **−58,5** | 513→454,5 |
| PricingDialog | conditionnel `Boolean(pricingDialogOpen)` + fallback modal accessible | −4 | 454,5→450,7 |

**Plancher mesuré = 450,7 KiB gz.** Gate 420 → reste −30,7.

### Corrections d'audit superviseur (toutes appliquées)
- Preload metric-gaming : ZÉRO preload-au-montage ; create-email = pointerenter/focus du bouton
  compose ; motion/reply/reader = Suspense sur ouverture réelle. Mesure structurelle (closure).
- Worker : garde nav stricte (GET/HEAD + Accept text/html ou Sec-Fetch-Mode navigate) ; `!shell.ok`
  → propage la réponse shell ; HEAD → body null. 5 preuves curl (a-e) vertes.
- Icônes restart : `runId` increment → key remount → CSS animation re-run (même déjà active).
  Commentaires factuels (pas d'équivalence visuelle non testée).
- CreateEmail fallback : `ComposeLoadingFallback` accessible (role=status, aria-live, Loader2
  aria-hidden, sr-only). PricingDialog fallback : role=dialog, aria-modal, aria-label, sr-only.
  connection/add entrée : keyframe grid opacity + tile opacity/translate (propriété CSS `translate`,
  n'écrase pas hover/active `transform:scale`) + prefers-reduced-motion.
- root.tsx : 5 clés #38 consommées.

### Analyse surfaces conditionnelles restantes (read-only)
- email-utils (11,9) : ancré par `mail-list-thread.tsx` (highlightText, liste TOUJOURS rendue) → core.
- onboarding (7) : `components/onboarding.tsx` + `mail/layout.tsx` = HORS may-touch (interdit).
- palette-deep (~15, in-boundary) : split provider-léger/dialog-lazy — RECOMMANDÉ, en attente ruling.
- Reste = infra RR7/React/core (react 84, KS7C4IRE 40,9 = RR7 history partagé, query-provider 19,7,
  utils 19,7, types 12,2, app-sidebar 18,2, page-mail-core 39,6) — non réductible légitimement.
**420 non annonçable « gate atteint » sous la règle anti-metric-gaming ; plancher legit ≈ 435 (avec palette-deep) ou 450,7.**

### GRAPHE D'ANCRAGE motion (exigé) — commande : grep du nom de chunk motion dans build/client/assets/*.js
Importeurs SOURCE de `motion/react` atteignables depuis le critique :
- `components/icons/animated/{sun,moon,square-pen}.tsx` → via `theme/theme-toggle.tsx`,
  `ui/nav-user.tsx`, `theme/sidebar-theme-switcher.tsx`. (icônes+theme in-boundary ; nav-user aussi
  post-#38). De-motion des icônes (CSS) retire cet ancrage chez TOUS les consommateurs.
- `components/connection/add.tsx` (AddConnectionDialog) → via `ui/nav-user.tsx` (import statique l.28).
  Lazy-load dans nav-user (post-#38) retire cet ancrage.
- `components/motion-primitives/text-effect.tsx` → via email-composer (déjà lazy) → NON critique.
- entry.client.tsx : n'importe PAS motion (transitif seulement, 32 l.) — pas une cible.
chunk-KS7C4IRE (40,9 KB gz / 121 KB raw) : minifié, aucune signature grep-able ; importe motion ;
ancré dans l'arbre toujours-rendu. Éviction = non identifiable dans le budget (ruling additionnel).

## RELÈVE -02 — finalisation post-dégel (MIRROR: ORCHESTRATOR)

Relève bornée du -01 (arrêté sur gel réseau/contexte, travail excellent quasi complet). Mission ÉTROITE :
finaliser sans retravailler. Base rebasée `0e55cc09` (tip origin/factory/niveau9 = ruling dégel). Le revert
`apps/mail/package.json` + `pnpm-lock.yaml` était FINAL et intact (diff vs HEAD vide ; l'entrée user-event
résiduelle du lockfile appartient à l'importer `packages/testing`, devDep pré-existante `^14.5.1`, sans lien
avec l'incident — apps/mail ne la référence plus).

### 1. Réécriture `app-sidebar.triggers.test.tsx` — OPTION A structurelle (ruling d2f3e884, dégel 0e55cc09)
Retrait total de `@testing-library/user-event` (dep revertée). Forme Option A pour `ComposeButton` ET
`PricingTrialButton` (déjà exportés/extraits par le -01) :
- clic SOURIS RÉEL via `dispatchEvent(new MouseEvent('click', {bubbles:true}))` → `useQueryState` passe
  truthy → la surface monte (ComposeSurface via DialogContent / PricingDialogSurface) → factory d'import
  lazy INVOQUÉE (compteur hoisted vérifié **0 à froid puis >0**) → fallback accessible PRÉSENT pendant la
  suspension (`role=status` « Loading composer » / `role=dialog[aria-label="Loading pricing"]`) → composant
  final rendu après resolve.
- assertion structurelle `expect(btn.tagName).toBe('BUTTON')` pour chaque trigger.
- sonde happy-dom `CLICKS_AFTER_ENTER=0` au dossier (Enter/Space natifs ne synthétisent AUCUN clic
  d'activation sous happy-dom) → Enter/Space NATIFS explicitement **ROUTÉS #40** (déviation libellée dans le
  test et ci-dessous), le chemin clic (issue d'activation identique) restant asserté localement.
3 tests, RC=0, stderr propre (run isolé). Aucun autre fichier touché.

### 2. Rerun complet sans la dep (RC natifs non masqués, séquentiels)
| Gate | Commande | RC |
|---|---|---|
| mail vitest (full) | `pnpm --filter @zero/mail exec vitest run` | **0** (23 fichiers, 139 tests) |
| install frozen | `pnpm install --frozen-lockfile --ignore-scripts` | **0** (lockfile intact) |
| server types / mail types / typegen | `@zero/server types` ; `@zero/mail types` ; `react-router typegen` | **0 / 0 / 0** |
| tsc ×2 | `@zero/server exec tsc --noEmit` ; `@zero/mail exec tsc --noEmit` | **0 / 0** (0 erreur chacun) |
| pnpm test (turbo) | `pnpm test` | **0** (188 serveur + 139 mail = **327**) |
| ratchets | loc / type / console | **0 / 0 / 0** (PASSED, non-croissants) |
| agent-surface | `check-agent-surface.mjs` | **0** (least scopes, draft-only MCP) |
| dry-run serveur | `wrangler deploy --dry-run --env local` | **0** (21 869,50 KiB / gz **2 743,25**) |
| dry-run mail | `wrangler deploy --dry-run` | **0** (worker spa-fallback 1,13 KiB / gz 0,55 + binding ASSETS) |

Note honnête : le run mail émet des lignes stderr d'error-path PRÉ-EXISTANTES (use-optimistic-actions:149
« Error: net » simulé ; keyboard-parity « KeyboardLayoutMap non supporté ») — INTENTIONNELLES, hors de mon
diff ; mon test réécrit n'introduit ZÉRO stderr nouveau.

### 3. Rebase strict final
(a) inventaire = 17 suivis (16 M + 1 D) + 13 non-suivis = 30 lignes porcelain ; `git diff --stat` = 17
fichiers, +375/−850. (b) `git stash push -u` (arbre propre, 0 porcelain). (c) `git fetch origin
factory/niveau9` + `git rebase origin/factory/niveau9` : HEAD `f143abf9` ÉTAIT ancêtre → fast-forward, zéro
commit local à rejouer ; seul fichier du delta factory = `a8-client-completion-01-rulings.md` (appends
rulings, AUCUN de mes fichiers). HEAD post-rebase = **`0e55cc09`**. (d) `git stash pop` RC=0, ZÉRO conflit.
(e) porcelain post-pop == inventaire (30 lignes identiques, **zéro perte**) ; `origin/factory/niveau9` et
`0e55cc09` ancêtres de HEAD = YES ; `git diff --check` = CLEAN. (f) build natif frais (RC=0, prerender `/`
→ index.html + SPA Fallback → __spa-fallback.html) puis **re-mesure gelée** `measure-critical.py apps/mail`.

### 4. Re-mesure gelée (arbre rebasé `0e55cc09`) = chiffre candidat
**JS critique inbox `/mail/inbox` = 435,9 KiB gz** (446 350 octets gz / 1 324 895 raw, 110 chunks).
Chunk >900 KiB raw : NONE (PASS). Reproduit à l'identique le plancher final du -01.

### FORMULATION FINALE (unique, opposable)
**Gates fonctionnels et structurels VERTS ; gate poids A8 FAIL — 435,9 KiB vs ≤420, écart 15,9.**
Jamais « tous gates verts » : le gate poids est un gate et reste FAIL tant que >420. L'écart 15,9 KiB est
STRUCTUREL (infra toujours-rendue au load inbox + cœur framework react/RR7/query-provider), pas un défaut
d'exécution ; le réduire par lazy serait le metric-gaming interdit par f143abf9. Fermer 420 exige de
réduire l'infra core (hors périmètre, critique droite) ou de redéfinir la mesure/gate (hors périmètre) —
reste-à-faire par propriétaire (ventilation par chunk au tableau ci-dessus).

**DETTES ROUTÉES #40** (env local ne peut les produire ; aucun contournement) : rendu navigateur
authentifié (session login interactif) ; trace réseau cold-inbox loggée (CORS localhost bloque
get-session/autumn) ; activation clavier Enter/Space NATIVE (happy-dom ne synthétise pas le clic —
`CLICKS_AFTER_ENTER=0`). Le substitut local (tests rendu réels par clic + fermeture statique assertive)
couvre le déterministe.

**STATUS: COMPLETE_WITH_CONCERNS** — gate 420 NON atteint dans la boundary (plancher structurel 435,9 KiB,
écart 15,9) ; reste-à-faire par propriétaire (infra core react/RR7/query ; redéfinition mesure/gate) ;
dettes routées #40 (navigateur authentifié + trace cold-inbox + Enter/Space natifs). STAND-DOWN après ce
rapport — plus aucune écriture sans ACK orchestrateur.
