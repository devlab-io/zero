# Certification M2 — barème perf 9/10 (staging réel, arbre final)

*Barème : `docs/spec/perf-9sur10.md` (10 axes ; 9 = cible atteinte, 10 = dépassée,
sinon proportionnel ; verdict 9/10 = moyenne ≥ 9,0 ET aucun axe < 8).
Protocoles : B0-comparable (build prod local + Lighthouse 3 runs médiane via
`wrangler dev`) + M1 (`docs/spec/perf-m1.md`, parcours authentifié cookies
session, lecture seule). Feu vert deploy : Thomas, 2026-07-13 (relayé session
Jarvis surface:4, faits git vérifiés avant exécution).*

## Conditions (2026-07-13, 19:45–20:40 UTC-10)

| Condition | Valeur |
|---|---|
| Réseau | fixe Tahiti, warp=**off**, colo=**PPT** (identique M1) |
| Arbre déployé | `f61d95e2` (= code `77ce02b2` scellé niveau9, docs seuls ajoutés) |
| Workers | `zero-server-staging` v `68a78042`, `zero-staging` v `1632ad72` |
| Transfert réel mesuré | chunk react 83,7 kB compressé en 55 ms (~1,5 MB/s, cache edge) |
| Session | cookies Chrome « Profile 1 » (3 déchiffrés), headless, fichiers temp effacés, session stoppée en fin |

## Incident de déploiement (constat livrable)

Premier boot = **500 sur toutes les routes serveur** : `assertServerEnv`
(`apps/server/src/env-schema.ts:14,16`) exige `DATABASE_URL` et
`BETTER_AUTH_URL`, **jamais lus au runtime** (DB via `env.HYPERDRIVE.connectionString`
— `db/durable-objects.ts:178`, `lib/auth.ts:341` ; auth `baseURL` via
`VITE_PUBLIC_BACKEND_URL` — `auth.ts:371`). Bug latent expédié par le run
niveau9 (A6) faute de tout déploiement (« aucun deploy » était la règle).
Corrigé sans toucher au code : 2 secrets posés sur le worker (valeurs réelles —
URL publique Railway PG, URL du worker). **Follow-up code proposé** : retirer
ces 2 clés du schéma requis ou les lire réellement.

## Mesures

### Fenêtre 1 — inbox authentifiée, client froid, serveur post-deploy froid

189 requêtes, 49 tRPC = **1 588 kB**. `listThreads` ×1 : **7 590 o** (projection
riche : `id, historyId, subject, sender, receivedOn, labels, unread` — 15/15
rangs complets), 10 413 ms (réveil DO + migration + froid, voir fenêtre 2).
**La liste se rend depuis la projection** (sujets/expéditeurs/labels réels
constatés) **sans attendre aucun corps**.

**MAIS — N+1 résiduel confirmé et localisé** : `ThreadContextMenu`, monté par
chaque rang (`mail-list-thread.tsx:447`), appelle `useThread(threadId)` **sans
`enabled:false`** (`components/context/thread-context.tsx:167`) → **15
`mail.get` = 1 215 kB (méd. 4 896 ms) + 15 `processEmailContent` = 383 kB** au
premier rendu. Le fix #30 a gardé le rang (`mail-list-thread.tsx:48`,
`isProjected` ✓) mais a raté le menu contextuel. Non bloquant pour le rendu,
absent à chaud (staleTime 1 h + persistance idb), mais ~1,6 MB re-payés à
chaque cache client froid. vs M1 : 20 `mail.get` = 1,8 MB structurels.

### Fenêtre 2 — rechargement (chaud)

28 requêtes, 5 tRPC = **16,5 kB**, **0 `mail.get`, 0 sanitisation**. Liste
visible à **2,75 s** (boot JS inclus), **avant** le retour réseau — servie du
cache idb, revalidation en fond (`listThreads` 5 952 ms et 5 363 ms, 7 590 o).
Local-first : vécu, mesuré.

### Ouverture de fil

- **Chaude** (corps préchargé) : panneau ouvert, 0 `mail.get`,
  `processEmailContent` 1 069 ms = coût perçu dominant (~1,1-1,5 s).
- **Froide** (fil page 2 jamais chargé, deep-link SPA) : **4,19 s perçue**,
  dont `mail.get` = 4 069 ms serveur pour **14,7 kB** — le coût est presque
  intégralement serveur (DO/driver), exactement la prédiction M1 §3.2.
- Constat neuf : les endpoints authentifiés restent multi-secondes même chauds
  (`verifyEmail` 7,8 s, `getMessageAttachments` 7,7 s, `brain.generateSummary`
  4,2 s, `listThreads` 5,4-7,9 s) — sérialisation par Durable Object + chemin
  driver. **C'est le verrou dominant du vécu authentifié désormais** (le poids
  client ne l'est plus).

### TTFB API (2 fenêtres)

- Post-deploy froid : 1,656 s puis 1,545 s, puis 0,036 s (chaud).
- 20:35, connexions fraîches : 0,042 / 0,039 / 0,040 / 0,044 s ;
  keep-alive : 0,036 / 0,013 / 0,016 s. Landing complète (102 027 o) : 119 ms.

### Lighthouse (3 runs, médianes)

| Cible | Score | FCP | LCP | TBT/CLS |
|---|---|---|---|---|
| **Staging réel** `/` | **0,59** | **6 765 ms** | **9 040 ms** | 0 / 0,00-0,02 |
| Local wrangler (B0-comparable, arbre scellé) | 0,72 | 4 547 ms | 4 638 ms | 0 / 0,017 |

(V5e local : 0,82 / 3 477 / 3 627 — écart = variance inter-sessions ; la cause
structurelle est inchangée : **le héros prerendu porte toujours
`opacity:0;transform:translateY(20px)`** dans `index.html` — le constat
« prerender invisible » de la re-mesure V5e n'a **jamais été corrigé** ; FCP≈LCP
restent calés sur le boot JS.)

### Build local (arbre scellé, méthode B0)

Shell `__spa-fallback` : **260,2 kB gz** (45 fichiers) + chunk inbox
`page-B0bDNXow.js` **38,5 kB gz** = **chemin critique 298,7 kB gz** (V5e : 302 ;
V7 weight-hunt −3,5). Total JS raw 3 945 kB. `index.html` prerendu 102 kB.

### Médias (arbre scellé)

`public/` total **4,91 MB** ; onboarding **2,39 MB** (≤ 3 MB ✓, 0 GIF, vidéos
mp4) ; fichiers > 500 kB : 2 (step1/step2.mp4 — exception onboarding budgétée) ;
orphelins purgés ✓.

## Notation

| # | Axe | Mesure M2 | Cible | Note |
|---|---|---|---|---|
| 1 | Chemin critique | 298,7 kB gz (base 499, −40 %) ; FCP 4,5 s local ; fallback actif | ≤ 250 kB ; FCP ≤ 2,5 s | **6,5** |
| 2 | Landing LCP | LCP 9,0 s staging / 4,6 s local ; prerender réel mais **invisible (opacity:0)** ; images ✓ | ≤ 2,5 s | **4** |
| 3 | Liste inbox | 1 `listThreads` projetée 7,6 kB ✓, rendu sans corps ✓ ; **15 `mail.get` résiduels à froid client (bug menu contextuel)** | 0 `mail.get` | **7** |
| 4 | Ouverture fil | chaud ~1,1-1,5 s ; froid **4,19 s** (serveur) ; placeholder ✓ | ≤ 800 ms chaud | **5** |
| 5 | Actions optimistes | envoi non-bloquant prouvé code+tests (`await refetch` retiré) ; envoi réel non exercé (garde-fou) | 100 % optimiste | **8,5** |
| 6 | Réouverture | liste servie du cache **avant** le réseau, revalidation en fond, 0 refetch corps — vécu mesuré | cache-first < 500 ms | **8** |
| 7 | Fiabilité réseau | retry backoff ✓, `isError` consommé ✓, HydrateFallback ✓, états d'erreur testés ; coupure vécue non simulée | 0 état mensonger | **8** |
| 8 | Sync Gmail | 2000→**67** round-trips (compteurs, tests) ✓ batch+backoff ✓ ; **durée réelle jamais mesurée** (pas de re-sync forcée sans décision) | ÷10 appels, durée ÷3 | **7,5** |
| 9 | TTFB / cold | chaud **0,04 s** ✓✓ ; froid isolate 1,5-1,7 s ✗ ; **endpoints DO authentifiés 4-10 s même chauds** | froid ≤ 0,9 s ; chaud ≤ 0,2 s | **5,5** |
| 10 | Médias & hygiène | onboarding 2,39 MB ✓, 0 GIF, 0 orphelin, 2 mp4 en exception budgétée | ≤ 3 MB, 0 > 500 kB hors exception | **9,5** |

**Moyenne : 6,95 ≈ 7,0/10. Verdict : NON CERTIFIÉ 9/10** (moyenne < 9,0 ; 5 axes
< 8). Trajectoire honnête : **4/10 → 7,0/10** mesurés dans les mêmes conditions.
NB : la note 8,85 du run niveau9 porte sur SON barème (architecture) ; celle-ci
porte sur le vécu perf réseau réel — les deux sont cohérentes entre elles.

## La dernière ligne droite (par gain décroissant)

1. **Latence serveur authentifiée** (axes 4, 9 — le verrou dominant) :
   `mail.get` froid 4 s pour 15 kB, `listThreads` 5-8 s même chaud, endpoints
   4-10 s. Piste : profiler le chemin DO→driver→Gmail (sérialisation DO,
   allers-retours Gmail à la demande, Hyperdrive), puis préchargement du fil au
   survol (pattern Superhuman, prévu par le ruling w2a).
2. **Prerender invisible** (axe 2) : animations prerender-safe (état initial
   visible, `initial={false}` si HTML prerendu) — gain attendu LCP ≤ 2,5 s,
   déjà spécifié dans `perf-remesure-v5.md`.
3. **Garde `enabled:false` sur `ThreadContextMenu`** (axe 3) : 1 ligne
   (`thread-context.tsx:167`) → −1,6 MB à chaque premier rendu. Attention :
   supprime aussi le préchargement accidentel qui masque le froid de l'axe 4 —
   à coupler avec le préchargement délibéré (point 1).
4. **Chemin critique −49 kB** (axe 1) : 298,7 → ≤ 250 kB gz.
5. **Env-schema serveur** : retirer `DATABASE_URL`/`BETTER_AUTH_URL` du requis
   (incident de deploy ci-dessus).

Les 7 demandes auth BLOCKED de la QA niveau9 (#40) sont désormais débloquées
par ce déploiement (budgets clavier/composer non couverts ici — mesurables à la
demande).
