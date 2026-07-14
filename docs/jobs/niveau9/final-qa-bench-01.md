# Job — final-qa-bench-01 (issue devlab-io/zero#40)

Type : **VÉRIFICATION** — code produit INTOUCHABLE. Effort L. Parent : #13, vague V6.
Checks gelés normatifs : `docs/checks/niveau8/performance.md` + `docs/checks/niveau8/visual-qa.md`.
Barème froid : `docs/checks/niveau9/grading-rubric.md`. Contrat de dettes : `final-qa-bench-01-rulings.md`.

---

## PHASE 0 — Plan + désaccords (rédigée AVANT toute mesure)

### Garde d'entrée — VÉRIFIÉE

| Contrôle | Attendu | Constaté | État |
|---|---|---|---|
| Worktree | `.architect/wt/niveau9/final-qa-bench-01` | idem | OK |
| Branche | `job/niveau9/final-qa-bench-01` | idem | OK |
| HEAD | `1c82b196cbc87d629b18024cca3f4ac6b7372af2` | idem | OK |
| `docs/checks/niveau8/performance.md` | présent | présent (816 o) | OK |
| `docs/checks/niveau8/visual-qa.md` | présent | présent (619 o) | OK |
| `docs/jobs/niveau9/final-qa-bench-01-rulings.md` | présent | présent (2,0k) | OK |
| `docs/checks/niveau9/grading-rubric.md` | présent | présent (7,8k) | OK |
| STOP dans worktree | absent | absent | OK |

→ Aucune divergence. Le job procède.

### Périmètre autorisé (BOUNDARIES)
- **MAY TOUCH** : `docs/research/niveau9/**` UNIQUEMENT + ce fichier (`docs/jobs/niveau9/final-qa-bench-01.md`) + scripts de mesure jetables dans `.architect/tmp/` (non commités).
- **MUST NOT TOUCH** : tout code produit, toute config, `docs/checks/**`, lockfile, les autres `docs/jobs`.

### Séquence d'environnement (avant toute mesure)
`pnpm install --frozen-lockfile --ignore-scripts` → server wrangler types → mail wrangler types → `react-router typegen` → build. `wrangler dev` **LOCAL uniquement**. AUCUN deploy, AUCUN envoi réel, AUCUNE mutation de données réelles, AUCUN credential. Sorties brutes conservées, temp dans `.architect/tmp/`.

### Plan de travail (workstreams)

**WS1 — Environnement de preuve.** Install frozen, génération des types wrangler (2 workers), typegen react-router, build mail. Journaliser exit codes et durées bruts sous `docs/research/niveau9/`.

**WS2 — Dossier d'évidences par axe A1..A10.** Exécuter CHAQUE commande de preuve **gelée** du barème avec sortie brute, rangée sous `docs/research/niveau9/axis-evidence/`. Distinguer par palier : commande read-only (exécutable intégralement), build local (exécutable), inspection CI/config (exécutable par lecture), runtime authentifié (BLOCKED → demande superviseur). Un critère non prouvé = non acquis, jamais estimé.

**WS3 — Bench performance (harnais R10).** Contre les budgets absolus de `performance.md` :
- Latences interactives (clavier ≤100 ms, composer ≤150 ms, thread caché ≤200 ms, inbox chaude ≤800 ms, shell contraint ≤1500 ms) : **majoritairement chemin authentifié** → mesure locale bornée à ce qui est atteignable sans session ; le reste BLOCKED avec demande superviseur précise.
- Poids build : `python3 scripts/checks/measure-critical.py .` (mesure gelée, union modulepreload /mail/inbox), + inventaire chunks >900 KiB. Exécutable localement.
- Réseau premières 50 lignes inbox (0 N+1 par ligne) : **authentifié** → BLOCKED, trace superviseur demandée.
- Harnais : 2 warmups + ≥10 itérations, ordre alterné, médiane + p75, brut JSON/CSV conservé sous `docs/research/niveau9/`. Profil réseau Tahiti 175 ms / 1,5 Mbps quand applicable.
- INP/CLS : Lighthouse/trace sur surface atteignable sans auth ; workflow authentifié BLOCKED.

**WS4 — QA visuelle desktop/mobile.** 1440×900 + 390×844 sur **routes atteignables SANS session** (landing, pricing statique, login, pages d'erreur/legal). États distincts par surface, reduced-motion, screenshots sous `docs/research/niveau9/`. Inbox/list/thread/composer réels = authentifiés → BLOCKED (demande superviseur).

**WS5 — Dettes de preuve AUTHENTIFIÉES → demandes superviseur ou BLOCKED.** Pour chacune (rendu réel Pricing/CreateEmail, activation Enter/Space native, trace réseau cold-inbox, smoke MCP #36, comparatif Shortwave) : formuler la DEMANDE PRÉCISE exécutable par la surface superviseur (URL, gestes, ce qu'il faut observer/capturer) OU marquer BLOCKED explicite. Jamais estimé, jamais contourné (cookie/proxy/override INTERDITS — hard stop).

**WS6 — Vérif gen-trpc-boundary.** Identifier le commit post-#43 qui fait diverger le générateur du snapshot committé ; statuer au RAPPORT (régénération avec revue du delta de surface, ou correctif générateur). **Aucun fix** — appartient au propriétaire.

**WS7 — Résiduels code connus à VÉRIFIER/documenter (pas fixer).** `voice-provider.tsx:129-130` (`.name`/`.email` non gardés, même classe que les 6 guards #34) ; commentaire périmé `thread-display-hotkeys:17` ; `closeView` no-op. Constat + localisation exacte au rapport.

**WS8 — Rapport final.** Tableau budget → mesuré → PASS/FAIL (médiane+p75), inventaire évidences par axe A1..A10 → fichiers, demandes superviseur / BLOCKED explicites, vérif boundary-drift, ligne STATUS, SendMessage team-lead, STAND-DOWN. Pas de commit.

### Désaccords / tensions relevés (challenge avant de bâtir)

1. **`performance.md` ne peut PAS PASSER intégralement sur surface non authentifiée.** Le check exige : warm-inbox p75, cached thread-open p75, comparatif Shortwave (−10 %), trace réseau des 50 premières lignes, INP/CLS du workflow testé. Tout cela est **authentifié**, or la build locale échoue STRICTEMENT sur CORS staging (fait #44), et cookie/proxy/override sont INTERDITS. **Position** : je mesure ce qui est atteignable localement (poids build, chunks, latences non-auth atteignables), je marque le reste BLOCKED avec demande superviseur précise, et je ne substitue JAMAIS d'estimation. Le check reste **non-PASS localement** — c'est un constat honnête, pas un échec du job (AS du run).

2. **Tension sur le chiffre JS critique de référence.** Le brief cite « 435,9 KiB gz (gate 420 FAIL −15,9) » (référence merge V5) ; l'amendement A8 du barème cite « 622,4 KiB état au transfert » vers #44. Deux points de mesure/commits distincts. **Position** : je re-mesure au commit gelé `1c82b196` avec la commande gelée `measure-critical.py` et je rapporte le chiffre RÉEL constaté, en libellé honnête (jamais « poids OK » tant que >420), en réconciliant explicitement avec les deux références citées. Le gate est nominalement porté par #44 ; le palier A8 final reste dû au juge.

3. **`visual-qa.md` exige « les routes exactes changées ouvertes dans un navigateur local ».** Les surfaces mail réelles (inbox/list/thread/composer) sont authentifiées et bloquées par CORS. **Position** : je couvre exhaustivement les surfaces non-auth atteignables et je formule pour chaque surface authentifiée une demande superviseur exécutable (URL staging + gestes + captures attendues), ou BLOCKED explicite. Le check n'est pas intégralement satisfiable localement.

4. **Le barème A1..A10 mélange commandes read-only et critères runtime.** La majorité des paliers 7/9 sont prouvables par grep/build/lecture de config (exécutables intégralement, sortie brute conservée). Une minorité (perf runtime, e2e CI live) dépend du runtime authentifié ou d'une CI verte réelle. **Position** : j'exécute toute commande gelée exécutable avec sortie brute ; je marque BLOCKED précis le reliquat runtime. C'est le dossier du juge froid, pas un verdict — je ne note pas les axes, je fournis l'évidence.

5. **`docs/research/niveau8/benchmark-raw.*` référencé par `performance.md` est absent** (seul `security-wave-1.md` présent sous niveau8). Le check pointe une évidence de vague antérieure non produite. **Position** : je produis l'évidence bench sous `docs/research/niveau9/` (mon périmètre), je signale l'absence de l'artefact niveau8 comme constat, sans y toucher (hors périmètre).

### Garde-fous personnels
- RC natifs non masqués partout (pas de `|| true`, pas de `2>/dev/null` sur les commandes de preuve).
- Aucune écriture hors périmètre. Vérification boundary-drift en fin de job (`git status` restreint à mon périmètre).
- Persistance jusqu'au STATUS ; STAND-DOWN ensuite ; pas de commit.

---

## Résultats mesurés

Protocole : séquence env complète exécutée, puis chaque commande de preuve gelée avec sortie brute
sous `docs/research/niveau9/`. RC natifs non masqués. Fichier produit gen-trpc restauré après mesure.

### WS1 — Environnement de preuve (tous exit 0)
- `pnpm install --frozen-lockfile --ignore-scripts` → exit 0 (`.architect/tmp/install.log`).
- server `wrangler types --env local` → 0 ; mail `wrangler types` → 0 ; `react-router typegen` → 0.
- build mail → 0 : client **5511 modules / 27,35 s**, server SSR **956 modules / 15,92 s**
  (warnings non bloquants : CSS « Unexpected ) » + sourcemap `recipient-autosuggest.tsx`, 2 oxlint).

### WS2 — Dossier d'évidences par axe A1..A10 (juge froid) — `docs/research/niveau9/axis-evidence/`
Mesuré au commit gelé (≠ note : je fournis l'évidence, je ne note pas les axes) :

| Axe | Fichier | Faits mesurés saillants |
|---|---|---|
| A1 | `A1-boundaries.txt` | 1 fichier >1200 LOC = `microsoft.ts` (1291, ADR) ; **4 fichiers >800** (tous budgétés loc-ratchet, ≤6) ; frontière `../server/src` = **0** ; règle ESLint `no-restricted-imports` active ; `@zero/types` dans les 2 apps ; inventaire routes committé. Caveat : pas d'index barrel systématique par domaine. |
| A2 | `A2-typesafety.txt` | **`any` total 37** (mail 23 ≤25, server 14 ≤15) ; `@ts-nocheck`=0 ; **tsc server 0 / mail 0** (typecheck-report exit 0) ; non-null ~34 (heuristique grep, imprécise — signal, pas mesure). |
| A3 | `A3-tests.txt` | **327 tests passants** (server 188/15 fichiers + mail 139/23), `pnpm test` exit 0, tâche test bloquante CI. |
| A4 | `A4-cicd.txt` | 6 gates palier 7 présents ; + `wrangler types` avant typecheck, ratchets LOC/type/console, migrations-consistency, gitleaks épinglé v8.30.1, dry-run ×2, **gate deploy = CI verte requise (hard stop)**, lint-staged câblé, oxlint@1.9.0 identique hook/CI. Timeout config 20 min (rubrique <15 → mesure CI live requise). |
| A5 | `A5-observability.txt` | **console serveur 8** (≤20 ✓) ; **console front 121** (cible ≤40 → dépassé +81) ; 0 catch vide ; Sentry Worker présent (`lib/sentry.ts` + capture) ; console-ratchet en CI. |
| A6 | `A6-migrations.txt` | `migrations-consistency` **exit 0** (3 orphelins + 4 groupes préfixe dupliqués dans l'allowlist documentée) ; env zod via `env-schema` + `assertServerEnv` ; `.dev.vars.example` serveur présent ; `db-push-guard.mjs` présent. |
| A7 | `A7-security.txt` | `pnpm audit --prod --audit-level critical` **exit 0** (0 critical ; 48H/64M/14L) ; `check-agent-surface` PASS ; `mail.google.com` absent des scopes ; audit-triage.md (75 réfs GHSA, #37) ; gitleaks CI (working-tree) + historique 3376 commits en-job. |
| A8 | `A8-perf-structural.txt` | **JS critique inbox = 435,9 KiB gz → gate ≤420 FAIL (−15,9), plancher structurel** ; **0 chunk >900 KiB (PASS)** ; **0 GIF >1 MB** (GIFs→MP4) ; public/ **4,9 MB** (−70 MB vs baseline). |
| A9 | `A9-robustness.txt` | `mail-list.tsx` destructure `isError` (l.41), viewState `'error'` DISTINCT de `'empty'` (l.206/228) → défaut baseline corrigé ; états 404/erreur runtime capturés lisibles. |
| A10 ⚠️ **pre-#39** | `A10-docs-pre39.txt` | **PHOTO D'ÉTAT, PAS UN VERDICT** — ce gel précède la création d'ARCHITECTURE.md/FORK.md/LICENSE-NOTES.md par #39 (parallèle). État au gel : ces 3 fichiers **absents** (attendu), README inexact « Next.js/Node/PostgreSQL », **7 ADRs** (0001-0006 + collision n° `0004` ×2). **Le juge froid RE-EXÉCUTERA A10 sur le HEAD fusionné post-#39+#40** (rerun obligatoire consigné). |

**Réconciliation JS critique** : 622,4 KiB (état au transfert #44, amendement A8) → **435,9 KiB (commit gelé, mesuré ici)** — confirme exactement la référence brief « 435,9 KiB, FAIL −15,9 ». Libellé honnête : jamais « poids OK » tant que >420. Écart de chemin noté : la commande gelée `measure-critical.py .` depuis la racine échoue (sortie sous `apps/mail/build/client`) ; chiffre obtenu avec base `apps/mail`.

### WS3 — Bench performance (harnais R10) — `docs/research/niveau9/perf/`
Harnais R10 conforme (2 warmups + 10 itérations, ordre alterné, médiane+p75, brut JSON+CSV).
Mesuré local (SPA `ssr:false`, wrangler dev loopback) : landing `/` médiane **2,12 ms** / p75 2,36 ms ;
coquille deep-link médiane 2,07 / p75 2,48 ms — **latence static-serve, PAS un budget interactif**.

| Budget performance.md | État | |
|---|---|---|
| Clavier ≤100 / composer ≤150 / thread caché ≤200 / inbox chaude ≤800 ms (p75) | **BLOCKED (authentifié)** | demande superviseur |
| Shell contraint ≤1500 ms | **PARTIEL/BLOCKED** | shell local <3 ms ; boot authentifié + profil Tahiti BLOCKED |
| INP ≤200 / CLS ≤0,05 (workflow) | **BLOCKED (authentifié)** | demande superviseur |
| JS critique ≤420 KiB gz | **435,9 → FAIL (−15,9)** | measure-critical.py |
| Aucun chunk >900 KiB | **PASS (NONE)** | measure-critical.py |
| 0 N+1/ligne (trace réseau) | **BLOCKED runtime** ; code w2a/w2f (50 lignes = 1274 o gz) | demande superviseur |
| Comparatif Shortwave −10% | **BLOCKED** (≠ échec, AS du run) | demande superviseur |

Plancher arithmétique profil Tahiti (calcul sur artefact, PAS une latence mesurée) : 435,9 KiB gz @ 1,5 Mbps ≈ **2,38 s** + 175 ms RTT → plancher **~2,55 s** de livraison JS critique → le budget « shell contraint ≤1500 ms » est structurellement menacé sur profil Tahiti (à statuer par mesure authentifiée).

### WS4 — QA visuelle desktop/mobile — `docs/research/niveau9/visual/`
6 captures (1440×900 + 390×844), **0 overflow horizontal partout**. Landing prérendue **réelle** (hero/nav/mockup) ; reduced-motion émulé ; deep-link `/mail/inbox` sans session → **404 propre** ; `/login` sans backend → **ErrorBoundary lisible** (Refresh / Log Out and Refresh) = état d'erreur honnête. Surfaces mail authentifiées réelles = **BLOCKED**.

**Constat prerender (résout #44/d199c253)** : au commit gelé, `/` sert le **vrai HomeContent** (101 KB), les deep-links servent la **coquille neutre 6 KB** (`__spa-fallback.html` via worker `spa-fallback.ts`, 6 cas). Le constat antérieur « prerender émet une coquille vide » (commit d199c253) est **périmé** — corrigé par #44 (d5de5c3a). **Résiduel doc (known-issue propriétaire, NON fixé — code intouchable)** : le commentaire de `react-router.config.ts` est périmé (annonce HydrateFallback-only + `not_found_handling: single-page-application`, alors que `/` = HomeContent réel et config = `none` + worker dédié).

**Sonde deep-link / garde anti-masquage (dual-labellisée — `perf/deeplink-fallback-probe.txt`)** : correction d'un faux négatif de mon probe initial (curl par défaut envoie `Accept: */*`). Les DEUX moitiés sont conservées et libellées :
- **navigation** (`Accept: text/html` [+ `Sec-Fetch-Mode: navigate`]) : `/pricing`, `/login`, `/mail/inbox`, `/settings/general`, `/nonexistent` → **200 + coquille neutre 6 KB** (`animate-spin` présent, **0 marqueur HomeContent**) ; `/` → 200 landing réelle 101 KB.
- **non-navigation** (`Accept: */*`, y compris un asset réellement manquant `/assets/does-not-exist.js`) : **404 anti-masquage CONFORME** (garde stricte : un chunk/asset manquant surfacé comme 404, jamais masqué en HTML-200).
→ Le 404 initial observé au curl par défaut **N'EST PAS un deep-link cassé** : c'est la garde voulue. Deep-link réel navigateur (envoie `Accept: text/html`) = shell neutre 200, hydratation client de la route demandée.

### WS5 — Dettes de preuve AUTHENTIFIÉES → DEMANDES SUPERVISEUR précises (surface Computer Use)
Aucune estimée, aucune contournée. Chaque demande est exécutable sur le Chrome staging authentifié :

1. **Rendu réel Pricing/CreateEmail** — URL `https://zero-staging.devlab-tahiti.workers.dev/pricing` et `/mail/create` (session ouverte). Observer/capturer : le composant Pricing chargé conditionnellement (cf. #44 « Pricing conditionnel »), le composer CreateEmail réel monté. Captures desktop 1440×900 + mobile 390×844.
2. **Activation clavier native Enter/Space** — dans l'inbox authentifiée, focus une ligne, presser **Enter** puis **Space** ; observer que l'ouverture du fil se déclenche via handler natif (pas via user-event simulé — #44 a reverté user-event). Capturer le fil ouvert + noter la latence perçue (<200 ms cible thread caché).
3. **Trace réseau cold-inbox (anti-N+1 + anti-gaming préchargement)** — DevTools Network, vider le cache, charger `/mail/inbox` à froid. Capturer le HAR : prouver **1 requête liste + ≤1 body** pour les 50 premières lignes (0 N+1/ligne), et l'absence de préchargement massif non justifié (intent-based/idle only, ruling #44 f143abf9). Fournir le HAR brut.
4. **Bench latences interactives (R10 authentifié)** — sur la même machine, 2 warmups + 10 itérations alternées par scénario : clavier (≤100 ms), composer (≤150 ms), thread caché (≤200 ms), inbox chaude p75 (≤800 ms). Conserver le brut. Profil réseau Tahiti 175 ms/1,5 Mbps appliqué via throttling DevTools.
5. **INP/CLS** — trace Lighthouse (ou Performance panel) sur le workflow inbox authentifié : INP ≤200 ms, CLS ≤0,05.
6. **Comparatif Shortwave** — même machine, même profil réseau : inbox chaude p75 et thread-open caché p75 de Zero **vs** Shortwave ; exiger Zero ≥10 % sous Shortwave. Si Shortwave indisponible → **BLOCKED explicite** (≠ échec, AS du run).
7. **Smoke MCP #36** — surface agent draft-only : exécuter un cycle capabilities/search/outbox inspect-cancel-retry + createDraft idempotent ; prouver write = strictement draft+outbox (aucune mutation réelle). Capturer les réponses.

Si la surface superviseur ne peut exécuter l'une d'elles → **BLOCKED explicite** à consigner, jamais estimé.

### WS6 — Vérif gen-trpc-boundary (RAPPORT seulement) — `axis-evidence/WS6-gen-trpc-boundary.md`
**Divergence MESURÉE** : régénération → 4 ins/4 sup, **ordre de clés seul** (3 inputs : `drafts.list`,
`mail.listThreads`, `mail.processEmailContent`), aucun champ/type modifié. Snapshot écrit pour la
dernière fois à `d10f2b39` ; source inputs identique depuis ; TS 5.8.3 / @trpc 11.4.3 inchangés ;
seule mutation lockfile post-snapshot = `3b17f7fb` (#37, deps non-TS). Cause probable (non isolée) :
instabilité d'ordre d'émission `.d.ts` de tsc, snapshot non régénéré post-bump #37. **Aucun gate CI
de fraîcheur.** Ruling recommandé (propriétaire) : régénérer+committer avec revue « ordre seul » (sûr),
et/ou tri de clés déterministe, + gate CI `gen-trpc-boundary` `git diff --exit-code`. Risque actuel : négligeable, non gaté. **Fichier produit restauré (git checkout) — 0 ligne touchée.**

### WS7 — Résiduels code VÉRIFIÉS (aucun fix) — `axis-evidence/WS7-code-residuals.md`
- **R1 `voice-provider.tsx:130-131`** : `session?.user.name.split(' ')[0]` — `?.` ne garde que `session`, pas `.user.name` → crash si partiel. Même classe que les 6 guards #34, oublié ici (chemin gated feature voix). CONFIRMÉ.
- **R2 `thread-display-hotkeys.tsx:13-15`** : `closeView = () => event.preventDefault()` — **no-op** vs action annoncée « Close thread » (shortcuts.ts:239). CONFIRMÉ.
- **R3 `thread-display-hotkeys.tsx:17`** : commentaire « no picker surface reachable » **périmé** (pickers l/v ajoutés en #32 ; `setPicker` utilisé l.23). CONFIRMÉ.

### WS8 — Vérification boundary-drift (mon périmètre)
`git status` restreint : seuls `docs/jobs/niveau9/final-qa-bench-01.md` + `docs/research/niveau9/**`
créés/modifiés. Code produit, config, `docs/checks/**`, lockfile, autres jobs : **INTOUCHÉS**
(fichier gen-trpc restauré). Scripts jetables confinés à `.architect/tmp/` (non commités). Aucun deploy,
aucun envoi réel, aucune mutation de données réelles, aucun credential.

---

## MIRROR: ORCHESTRATOR
- **Preuve froide prête** : 10 fichiers d'évidence par axe avec sortie brute (commandes gelées),
  bench R10 (JSON+CSV), 6 captures visuelles — le juge froid peut rejouer chaque commande.
- **Gate JS critique** : 435,9 KiB gz, FAIL −15,9, plancher structurel — libellé honnête unique,
  porteur nominal #44. 0 chunk >900 KiB.
- **7 demandes superviseur** formulées, exécutables sur le Chrome staging authentifié ; tout le reste
  authentifié = BLOCKED explicite, jamais estimé (cookie/proxy/override non utilisés — hard stop respecté).
- **A10 = photo d'état pre-#39, PAS un verdict** : le gel précède la création des artefacts de gouvernance par #39 (parallèle). Évidence étiquetée `A10-docs-pre39.txt` ; **rerun A10 obligatoire par le juge froid sur le HEAD fusionné post-#39+#40** (consigné). Ne pas noter A10 sur cette photo.
- **Constats actionnables propriétaire** (RAPPORT, pas fix) : (a) snapshot gen-trpc stale ordre-seul, non gaté ; (b) 3 résiduels code (voice-provider guard, closeView no-op, commentaire hotkeys périmé) + commentaire `react-router.config.ts` périmé (known-issue).
- **Deep-link : garde anti-masquage CONFORME** (dual-labellisée) — navigation→shell 200 neutre, non-navigation→404 voulu. Aucun deep-link cassé.
- **Écart de commande gelée** : `measure-critical.py .` (racine) échoue sur le chemin de build.

## STATUS
STATUS: DONE — évidences par axe A1..A10 + bench R10 + QA visuelle produites (`docs/research/niveau9/`) ; JS critique 435,9 KiB gz FAIL −15,9 (0 chunk >900 KiB) ; tsc 0/0, 327 tests, console serveur 8 confirmés ; A10 = photo d'état **pre-#39** (`A10-docs-pre39.txt`, rerun juge obligatoire sur HEAD fusionné, PAS un verdict) ; deep-link garde anti-masquage CONFORME (sonde dual-labellisée, aucun deep-link cassé) ; boundary gen-trpc divergent ordre-seul non gaté (rapport, fichier restauré) ; 3 résiduels code + commentaire react-router.config périmé (known-issue) ; 7 demandes superviseur formulées, reste authentifié BLOCKED explicite ; 0 drift périmètre. Pas de commit.
