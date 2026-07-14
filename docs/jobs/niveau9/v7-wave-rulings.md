# Rulings — Vague V7 « niveau réel » (post-notation 8,45, arbitrage propriétaire 2026-07-13)

Fichier append-only, propriété orchestrateur. Cadre de la vague : poursuivre les GAINS
RÉELS en LOCAL (aucun push/PR/deploy sans feu vert propriétaire). Principes opposables :
- Le niveau réel prime sur le 9,00 arithmétique. Aucune chasse cosmétique.
- A1 : pas de barrels inutilisés pour le score — les index doivent porter une VRAIE
  frontière et être CONSOMMÉS, sinon le critère est documenté comme cosmétique.
- A4 : reste BLOCKED/provisoire sans run GitHub réel — simulation locale + baisse de
  timeout si légitime, JAMAIS « durée prouvée ».
- A8 : la mesure gelée NE CHANGE PAS après l'échec constaté. Tentative de réduction
  RÉELLE sous 420 d'abord. Toute évolution du barème = décision PRÉALABLE d'un arbitre
  froid indépendant sur la validité technique de la métrique, ancienne ET nouvelle
  mesures conservées.
- Chaque fan-in de vague = juge froid. Libellé honnête constant.

## Fences V7a (5 jobs parallèles, fichiers disjoints)
- a1-frontier-ci-01 : .github/workflows/ci.yml, config lint (packages/eslint-config,
  .oxlintrc.json), scripts racine si besoin d'un script lint ; INVESTIGATION index de
  domaines (consommés-réels ou documentés-cosmétiques, décision au rapport).
- a5-front-console-01 : sites console.* de apps/mail/{app,components,lib,hooks,store,
  providers} UNIQUEMENT + pattern de destination à proposer en PHASE 0 (ruling avant
  exécution massive).
- a3-driver-coverage-01 : NOUVEAUX tests apps/server/src/lib/driver/**.test.ts +
  __fixtures__ ; AUCUN code produit.
- a6-zod-mail-01 : apps/mail/workers/ uniquement (validation env honnête du worker).
- a8-weight-hunt-01 : INVESTIGATION d'abord (mesures, décomposition chunks, cold-start
  avant/après par worktree jetable) → rapport → ruling orchestrateur avant toute
  exécution de coupe. docs/research en écriture.
V7b (séquencé post-merge a5) : a2-nonnull-01 (84 → ≤10 par guards réels) + extension
type-ratchet @ts-expect-error (budget 4 + RULING nommant les 4 réels).

## RULING a8-weight-hunt-01 — coupes autorisées post-investigation (2026-07-13)

Rapport d'investigation reçu (5 fichiers docs/research/niveau9/perf/** + rapport, zéro
code touché, mesure gelée reproduite 435,9 KiB gz — conforme au cadre investigation-first).

### Volet cold-start — verdict ENREGISTRÉ, mesure et barème INCHANGÉS
Cold-boot serveur médian : AVANT (0e55cc09) 807,3 ms vs APRÈS (HEAD) 780,8 ms →
Δ +26,5 ms DANS LE BRUIT (σ 46–187 ms). Le critère « −1s » N'EST PAS acquis en
cold-start serveur mesurable. Seule défense honnête : borne de TRANSFERT client
−1,06 s @1,5 Mbps sur le delta mesuré −193,6 KiB gz — borne arithmétique, PAS une
mesure runtime (FCP/LCP Tahiti BLOCKED, SPA ssr:false + CORS). Aucune re-définition
de métrique par l'orchestrateur (arbitrage propriétaire : « ne change pas la mesure
après avoir vu l'échec juste pour passer »). La notation de ce sous-critère appartient
au juge froid de vague puis au contre-jugement final, sur ce libellé exact.

### Volet poids — ruling par lead
- **LEAD A — AUTORISÉ (primaire).** Split du god-module email-utils : déplacer
  `highlightText` (JSX pur) vers un module léger afin que mail-list-thread.tsx (liste
  FROIDE) cesse de tracter zod (12,2k) + Color (9,4k). PUR CODE-MOTION. Conditions
  opposables : (1) aucun lazy-au-mount, preload ou changement de condition de
  chargement — f143abf9 s'applique intégralement ; (2) DOMPurify RESTE statique
  (bimi-avatar froid, sécurité SVG) — ne pas l'évincer ; (3) aucun nouveau package,
  aucun changement d'API publique ; (4) preuve = measure-critical.py (script INTOUCHÉ)
  avant/après + trace réseau cold montrant l'éviction réelle ; (5) gates : tsc 0,
  vitest mail, build. Si le résultat reste ≥420, libellé honnête obligatoire.
- **LEAD C — AUTORISÉ (complément).** `build.target: 'es2022'` dans
  apps/mail/vite.config.ts, un seul champ. Conditions : build + tests verts, mesure
  avant/après consignée, revert immédiat si un gate casse.
- **LEAD B — NON AUTORISÉ dans cette tranche.** react-hook-form via
  nav-main→label-dialog frôle f143abf9 ; A+C suffisent à fermer le gate. Consigné
  comme follow-up nommé, conditionné à la preuve « montage sur INTENTION » (ouverture
  utilisateur réelle, trace cold sans le chunk) avant toute exécution future.
- **LEAD D — REFUSÉ.** Icônes majoritairement rendues cold : éviction = gaming ou
  casse UI.
- **LEAD E — REFUSÉ.** Hors-fence #44 ; l'arbitrage onboarding reste propriétaire.

Périmètre d'écriture a8 (exécution) : apps/mail/lib/email-utils.ts,
apps/mail/lib/email-utils.client.tsx (nouveau), apps/mail/components/mail/
mail-list-thread.tsx (1 import), apps/mail/vite.config.ts (build.target seul),
docs/research/niveau9/perf/**, docs/jobs/niveau9/a8-weight-hunt-01.md. Rien d'autre.
Builder ne committe pas ; STATUS final avec mesures + RC natifs.

## RULING V7b — a2-nonnull-01 : budget @ts-expect-error + fence (2026-07-13)

### Budget RULING @ts-expect-error = 4 (énumération opposable, vérifiée sur HEAD factory)
Les 4 occurrences existantes correspondent à de VRAIS trous de typings de libs
(pré-existants, 0 ajouté par le run) et sont budgétées ici nominativement :
1. `apps/mail/app/entry.server.tsx:2` — react-dom fournit un build ESM navigateur
   sans typings TS.
2. `apps/mail/components/ui/page-header.tsx:48` — incompatibilité de types slot/asChild.
3. `apps/mail/components/ui/page-header.tsx:50` — idem (même composant).
4. `apps/mail/components/create/editor-autocomplete.ts:214` — types tiptap
   incompatibles prosemirror.
Tout @ts-expect-error au-delà de ces 4 = FAIL ratchet. Le builder étend
`scripts/checks/type-ratchet.mjs` pour compter et gater : tsExpectError ≤ 4,
tsIgnore ≤ 1 (`apps/server/src/lib/email-processor.ts:1`, pré-existant — fix
optionnel, jamais requis), et nonNull ≤ valeur post-job (cible ≤10).

### Fence a2-nonnull-01
- Objectif : non-null assertions (postfixe `!`, hors `!=`, comptage juge : 84 à
  l'époque du jugement sur c80d4bf4-era ; le builder RE-MESURE la baseline exacte en
  PHASE 0 sur son gel avec commande explicitée — a5 a touché 59 fichiers mail depuis).
  Réduction par GUARDS RÉELS (narrowing, invariant explicite qui throw avec message,
  early-return honnête) — JAMAIS `as` de substitution, jamais eslint-disable, jamais
  d'affaiblissement de type. Comportement chemin heureux inchangé.
- MAY : sites `!` dans apps/mail/{app,components,lib,hooks,store,providers} et
  apps/server/src ; un helper `invariant` léger sans dépendance si utile ;
  scripts/checks/type-ratchet.mjs (extension) ; tests existants UNIQUEMENT pour
  rester verts (documenté) ; docs/jobs/niveau9/a2-nonnull-01.md.
- MUST-NOT (anti-collision a8 ACTIF) : apps/mail/lib/email-utils.ts,
  apps/mail/lib/email-utils.client.tsx, apps/mail/components/mail/mail-list-thread.tsx,
  apps/mail/vite.config.ts — sites `!` dans ces fichiers = DIFFÉRÉS et consignés.
- MUST-NOT (standard) : docs/checks/** (gelé), scripts/checks/measure-critical.py,
  package.json, pnpm-lock.yaml, migrations, .github/workflows/ci.yml (le ratchet y
  est déjà branché), tout fichier de config build.
- Gates : séquence env obligatoire (frozen install --ignore-scripts, server types,
  mail types, react-router typegen) ; tsc 0/0 ; suites mail + server vertes ;
  type-ratchet PASSED (any 23/15/38 INCHANGÉS + nouveaux compteurs) ; console-ratchet
  8/6 PASSED ; loc-ratchet PASSED. RC natifs. Builder ne committe pas.

### Amendement périmètre LEAD A (a8, 2026-07-13) — vérifié orchestrateur
`lib/email-utils.client.tsx` EXISTE déjà (foyer de handleUnsubscribe, importé par
thread-display.tsx:29, lazy donc non-froid) et `highlightText` y vit (l.65), avec un
unique consommateur froid mail-list-thread.tsx:17. Le périmètre d'écriture LEAD A
devient : **apps/mail/lib/email-utils-highlight.client.tsx (NOUVEAU, foyer léger de
highlightText seul)** ; email-utils.client.tsx (retrait du seul export highlightText) ;
mail-list-thread.tsx (1 import) ; email-utils.ts possiblement INTOUCHÉ. Toutes les
conditions du ruling initial (f143abf9, DOMPurify statique, preuves, gates)
inchangées. Anti-collision a2 : le nouveau fichier est réputé appartenir au
périmètre a8 jusqu'au fan-in.

## RULING a2-nonnull-01 PHASE 0 — E1/E2/E3 + helper (2026-07-13)

### E1 — type-ratchet any ROUGE au gel : CONFIRMÉ orchestrateur, correctif a3 ordonné
Reproduit sur HEAD factory : any(server)=17/15, any(total)=40/38 FAILED. Cause exacte
confirmée : merge a3 (3a809685) a introduit __fixtures__/google-http-fake.ts avec 3
`any` (l.24 root, l.53 auth, l.77 auth?) — la commande gelée ne connaît pas
__fixtures__ et elle NE CHANGE PAS. Défaut de process orchestrateur assumé : le merge
a3 a été vérifié tests+coverage mais PAS ratchets ; désormais les 4 ratchets
(type/console/loc/migrations) font partie de MA checklist de merge, chaque merge.
Correctif : micro-tranche a3-corrective par builder-a3-driver-01 (son fichier) —
typer honnêtement les 3 any, zéro changement de comportement, suite verte,
type-ratchet vert (server attendu 14/15, total 37/38). Ni a2 (hors fence) ni
l'orchestrateur (Hard Rule 4) ne touchent le fichier. Option (iii) REJETÉE :
le factory ne reste pas rouge.

### E2 — compteur nonNull AST : APPROUVÉ
Le critère barème « non-null assertions ≤10 » n'a PAS de commande gelée (seul le
comptage `any` en a une — vérifié rubric l.17). Le comptage grep porte 55 faux
positifs irréductibles (Tailwind `!` important-suffix ~50, strings de prose, lignes
commentées) : gater dessus forcerait à masquer du texte, pas des types. Compteur
nonNull = AST (nœuds NonNullExpression, typescript@5.8.3 DU repo, zéro dépendance),
même périmètre de dossiers, exclusions *.test.*, *.test-d.ts, *.d.ts. Le header du
ratchet documente la réconciliation grep⇄AST (105 = 50 réelles + FP énumérés par
catégorie) et le rapport porte LES DEUX chiffres pour le juge : le « 84 » du
jugement = grep conservateur ère c80d4bf4 ; réel AST au gel V7b = 50 ; cible ≤10
INCHANGÉE. @ts-expect-error (4) et @ts-ignore (1) restent en grep verbatim.

### E3 — exclusion .test-d.ts : APPROUVÉE (cohérence exclusion tests des ratchets ;
le `!` y est l'objet testé).

### Helper invariant : APPROUVÉ aux deux emplacements proposés
apps/server/src/lib/invariant.ts + apps/mail/lib/invariant.ts (duplication assumée :
builds disjoints, frontière front→serveur non percée — règle a1). Signature
`invariant(cond, msg): asserts cond`, throw explicite.

### Libellé gate a2 : tant que le correctif a3 n'est pas mergé, a2 rapporte le
type-ratchet avec « rouge any pré-existant attribué (fixture a3, correctif en
cours) » — jamais « PASSED » global. Vert intégral exigé au fan-in post-rebase.
