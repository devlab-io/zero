# Juge froid — Vague V7 « niveau9 » (judge-v7-wave-01)

- **Rôle** : juge FROID de vague, sans historique du run. Je REPRODUIS chaque preuve
  moi-même sur l'arbre gelé et je rends un verdict indépendant par LIVRAISON (pas la
  notation des 10 axes — contre-jugement séparé). Aucun fichier de code touché, aucun
  commit, aucun push. Seule écriture : ce rapport.
- **Gel jugé** : `93d2c7c80298bf77668855307f3ab1bb87e0b709` (HEAD factory local).
- **Worktree** : `.architect/wt/niveau9/judge-v7-wave-01`.
- **Vérif d'entrée** : `git rev-parse HEAD` == gel ✓ ; `git status --porcelain` = vide ✓.
- **Séquence env (obligatoire, précédents d'erreurs tsc fantômes)** — TOUS RC=0 :
  - `pnpm install --frozen-lockfile --ignore-scripts --offline` → RC=0
  - `pnpm --filter @zero/server run types` → RC=0
  - `pnpm --filter @zero/mail run types` → RC=0
  - `pnpm --filter @zero/mail exec react-router typegen` → RC=0 (paraglide compilé)
- **Protocole de preuve** : toute commande avec RC natif non maquillé
  (`cmd > log 2>&1; echo RC=$?`). Rapport écrit incrémentalement, section par section.

---

## 1. SOCLE — tsc, suites, ratchets — **ATTESTÉ**

Reproduit par le juge après séquence env (RC natifs) :

| Preuve | Commande | Résultat | RC |
|---|---|---|---|
| tsc server | `pnpm --filter @zero/server exec tsc --noEmit` | 0 `error TS` | 0 |
| tsc mail | `pnpm --filter @zero/mail exec tsc --noEmit` | 0 `error TS` | 0 |
| suite server | `pnpm --filter @zero/server test` | **23 fichiers / 298 tests passés** | 0 |
| suite mail | `pnpm --filter @zero/mail test` | **23 fichiers / 144 tests passés** | 0 |
| type-ratchet | `node scripts/checks/type-ratchet.mjs` | any(mail)=23/23 · any(server)=**14/15** · any(total)=**37/38** ; @ts-expect-error=4/4 · @ts-ignore=1/1 · nonNull=0/0 → **PASSED** | 0 |
| console-ratchet | `node scripts/checks/console-ratchet.mjs` | console(server)=8/8 · console(front)=**6/6** → **PASSED** | 0 |
| loc-ratchet | `node scripts/checks/loc-ratchet.mjs` | files>800 LOC=4/4 · frontier imports=**0/0** → **PASSED** | 0 |
| migrations-consistency | `node scripts/checks/migrations-consistency.mjs` | 42 sql / 39 journalled / **3 orphan** / 0 missing / **4 dup-prefix** ; drizzle agent 1/1/0 → **PASSED (drift within documented allowlist)** | 0 |

**Note honnête** : la suite server tourne via `test` = `vitest run` (mon premier essai `test run`
donnait `vitest run run` — 0 fichier trouvé RC=1 ; corrigé). Les 3 orphelins migrations et 4
groupes dup-préfixe sont des divergences *documentées* (allowlist résolue), pas des trous : le
check PASSE légitimement. **VERDICT SOCLE : ATTESTÉ** — tsc 0/0, 298+144 tests verts, 4 ratchets
verts, valeurs affichées conformes.

## 2. A2 (a2-nonnull) — **ATTESTÉ** (1 nuance de couverture)

### Compteurs type-ratchet
Reproduits exacts (cf. SOCLE) : any 23+14=37 · @ts-expect-error 4 · @ts-ignore 1 · nonNull 0.

### Recompte AST INDÉPENDANT (ma propre méthode)
Script juge autonome (`typescript@5.8.3` du repo, nœuds `NonNullExpression`, mon propre
`find` + walk, indépendant du script builder) :
- **Périmètre ratchet/fence** (mail app/components/lib/hooks/store/providers + server/src,
  hors `*.d.ts`/`*.test.*`/`*.test-d.ts`) → **nonNull = 0**. ✓ Confirme le `nonNull=0/0` du ratchet.
- **Balayage produit ÉLARGI** (tout `apps/mail` + `apps/server/src`) → **nonNull = 2**, tous deux
  dans `apps/mail/utils/keyboard-layout-map.ts` :
  - l.273 `this.layoutMap!.get(code)`
  - l.325 `layoutByRegion.get(region)!`
- Fichiers de test (exclus par design, E3) → 23 nœuds (assertions de type intentionnelles). Non-grief.

**NUANCE (pas une réfutation)** : `apps/mail/utils` n'a JAMAIS fait partie de la fence a2
(fence = app/components/lib/hooks/store/providers + server/src) NI du périmètre du ratchet.
Les 2 assertions y sont **pré-existantes** et hors-charge. La revendication « 50→0 » est **exacte
dans son périmètre mesuré** (les 50 de baseline y vivaient tous). MAIS « 0 en code produit » est
littéralement légèrement large : 2 non-null réelles survivent dans du code produit (`utils/`),
non-gatées par le ratchet — une régression future y ajoutant `x!` ne serait pas détectée. Défaut
mineur de *couverture du ratchet*, pas de la livraison. Le rapport builder gagnerait à écrire
« 0 dans la fence » plutôt que « en code produit ».

### 4 @ts-expect-error = 4 sites nominatifs du RULING V7b — **EXACT**
Grep verbatim (périmètre ratchet) → 4 sites, identiques au ruling :
1. `apps/mail/app/entry.server.tsx:2` (react-dom ESM sans typings) ✓
2. `apps/mail/components/ui/page-header.tsx:48` (slot/asChild) ✓
3. `apps/mail/components/ui/page-header.tsx:50` (idem) ✓
4. `apps/mail/components/create/editor-autocomplete.ts:214` (tiptap/prosemirror) ✓

`@ts-ignore`=1 → `apps/server/src/lib/email-processor.ts:1` (site budgété du ruling) ✓.

### Échantillon de 6 transformations de guards (diff merge 93d2c7c8 / commit 54f735d9) — happy-path PRÉSERVÉ
**Server (3)** :
- `routes/autumn.ts` (THROW ×11) : `invariant(autumn, …)` par handler. Vérifié au code : le
  middleware (l.70-88) `if (!env.AUTUMN_SECRET_KEY)` **return** dans CHAQUE branche (l.75/82/83/84/
  85/87) avant `c.set('autumn')` + `next()` (l.89-90). Un handler n'est donc atteint que si la clé
  est posée ⇒ `autumn` est c.set(). **Throw sur chemin réellement impossible.** Happy-path identique. ✓
- `routes/index.ts` (THROW ×1) : garde précoce l.339 `if (!c.req.header('Authorization')) return 401`.
  À l.362-363 le header est **garanti** présent (TS ne narrow pas deux appels `.header()` distincts).
  `invariant` réellement inatteignable. ✓
- `lib/driver/google-drafts.ts` (NARROWING ×5) : `draft.message!.id!` / `part.body!.attachmentId!`
  → capture `const messageId/attachmentId` + `if (!… ) return null` (comme le catch voisin).
  `attachmentParts` déjà filtré sur `body?.attachmentId` ⇒ happy-path identique ; le cas absent
  (avant = crash runtime `undefined.id`) devient un skip honnête. ✓

**Mail (3)** :
- `app/(full-width)/hr.tsx` : `.filter(Boolean)` + `o!.start/end` → `.filter((o): o is NonNullable<…> => o != null)`
  + `o.start/end`. Éléments = objet|null ⇒ `o != null` ≡ `Boolean` ici (aucun objet falsy). Identique. ✓
- `components/context/thread-context.tsx` : garde `if (!labels || !thread) return null` + capture
  `const currentThread = thread` pour propager le narrowing dans les closures (`thread!` supprimé). ✓
- `components/ui/chart.tsx` : `item!.dataKey` → `if (!item) return null` avant usage. Early-return honnête. ✓
- (bonus) `hooks/use-threads.ts` : `id!` → `id ?? ''`, inerte car query gatée `enabled: … && !!id`. ✓

**VERDICT A2 : ATTESTÉ.** Compteurs exacts, AST 0 dans la fence (recompté indépendamment),
4 @ts-expect-error nominatifs, guards réels préservant le happy-path avec throws sur chemins
impossibles. **Nuance** : 2 non-null pré-existantes hors-fence dans `utils/` non gatées — le
ratchet ne couvre pas 100 % du code produit ; libellé « en code produit » légèrement large.

## 3. A3 (a3-driver-coverage + correctif) — **ATTESTÉ**

Commande reproduite (verbatim du rapport) :
`cd apps/server && pnpm exec vitest run src/lib/driver --coverage --coverage.provider=v8
--coverage.include='src/lib/driver/**' --coverage.reporter=text` → RC=0, **168 tests / 12 fichiers**.

Table v8 reproduite (extrait) :
| Rollup | % Lines |
|---|---:|
| **`driver` (fichiers directs, HORS `__fixtures__`)** | **58,69** |
| `microsoft.ts` (gelé) | **0** (uncovered 1-1291) |
| `google.ts` / `index.ts` / `types.ts` (façade/ré-exports/types) | 0 |
| `__fixtures__` (sous-dossier séparé) | 98,27 |
| **`All files` (fixtures INCLUSES)** | **60,12** |

- **% lignes HORS fixtures** = **58,69 %** (dénominateur inclut microsoft.ts 0/1291) → **>50 %** ✓.
- **% lignes fixtures INCLUSES** = **60,12 %** (`All files`) → **>50 %** ✓. Les deux franchissent le seuil.
- `microsoft.ts` = **0 %** confirmé, gelé (may-not-touch), aucune couture d'injection. Le rapport
  builder porte le **libellé honnête** : « dossier plafonné à 65,36 % tant que microsoft.ts est gelé ;
  le seuil 50 % est franchi par le seul périmètre Google » (PHASE 0, l.48-50). Fidèle.
- Note de méthode : le « 1070 » du mandat = lignes exécutables microsoft (table PHASE 0 builder) ;
  v8 rapporte 0 % sur la plage 1-1291 (lignes totales du fichier). Même verdict : 0 %.

**VERDICT A3 : ATTESTÉ.** Seuil 50 % franchi des deux façons (58,69 hors fixtures / 60,12 incluses),
microsoft.ts gelé à 0 % avec libellé honnête et plafond documenté.

## 4. A5 (a5-front-console) — **ATTESTÉ**

### Comptage gelé console front (verbatim barème)
`grep -rE "console\." apps/mail/{app,components,lib,hooks,store} --include=*.ts --include=*.tsx
--exclude=*.test.* --exclude=*.d.ts | wc -l` → **6** ✓ (attendu 6). Les 6 sites :
- `lib/log.ts:32/35/38/41` — les **4 sinks** (`console.debug/info/warn/error`), par design.
- `app/entry.client.tsx:11` — `console.warn` bespoke (`reportRenderError` React, câblé Sentry à la main).
- `components/ui/nav-main.tsx:64` — **faux positif** : commentaire en prose « support console. », pas un appel.

### warn/error préservés en prod — vérifié dans `lib/log.ts`
- `warn(...args) { console.warn(...args) }` — **jamais gaté** (prod préservé) ✓
- `error(...args) { console.error(...args) }` — **jamais gaté** (prod préservé) ✓
- `debug` / `info` — gatés `if (import.meta.env.DEV)` (bruit dev, non expédié). Args **forwarded verbatim**
  (aucune sérialisation JSON — divergence assumée vs logger serveur, documentée).

### 5 conversions échantillonnées (diff commit a5 6313623d)
1. `console.error('Error parsing query parameters:', e)` → `log.error(...)` — args verbatim, prod OK ✓
2. `console.error('Failed to parse mailto URL:', error)` → `log.error(...)` ✓
3. `console.error(\`Error creating draft (attempt ${attempt}):\`, error)` → `log.error(...)` ✓
4. `console.error(error); console.error({message,details,stack})` (root.tsx) → `log.error(...)` ✓
5. **Correction sémantique** `onError: (e) => console.log(e)` → `onError: (e) => log.error(e)` (ai-sidebar) :
   sous mapping strict, `console.log→log.debug` serait invisible en prod (DEV-gated) et **perdrait** un
   handler d'erreur ; l'upgrade en `log.error` **préserve le signal**. Documenté honnêtement (sous-décision 4).
   Les `console.log` de debug jetable → `log.debug` (DEV-only), acceptable.

**VERDICT A5 : ATTESTÉ.** Comptage front = 6 verbatim, `warn`/`error` non gatés (prod préservé),
conversions verbatim, unique correction sémantique honnête et préservant le signal.

## 5. A6 (a6-zod-mail) — **ATTESTÉ**

- **Tests spa-fallback = 11** (attendu 11) : `vitest run workers/spa-fallback.test.ts` → RC=0,
  `11 passed`. ✓
- **assertMailEnv appelé au boot** : `spa-fallback.ts:53` — `bootEnv(env)` est la **1ère ligne** du
  `fetch` handler ; `bootEnv` (l.37-41) appelle `assertMailEnv` une fois par isolate. ✓
- **Schéma HONNÊTE, pas théâtral** : `env-schema.ts:26-29` — `fetcherBinding = z.custom<{fetch}>(
  (v) => typeof v?.fetch === 'function')`, et `requiredMailEnvSchema = z.object({ ASSETS: fetcherBinding })`.
  Le schéma **valide réellement la forme fetcher** d'ASSETS (`.fetch` callable), PAS un `z.object({})`
  vide. Le commentaire du fichier explicite pourquoi un `z.object({})` serait « cosmetic » ici.
- **Tests exercent la validation réelle** : `assertMailEnv({})` → throw `/ASSETS/` (absent),
  `assertMailEnv({ASSETS:{}})` et `{ASSETS:{fetch:'nope'}}` → throw `/ASSETS/` (présent mais non-fetcher),
  message pointe `/wrangler\.jsonc/`. Cas passant : fetcher valide + extras ignorés.

**VERDICT A6 : ATTESTÉ.** 11 tests, garde au boot réelle, schéma validant le fetcher (non théâtral),
échec lisible nommant ASSETS.

## 6. A1 (a1-frontier-ci) — **ATTESTÉ** (avec preuve négative)

- **Step CI présent** : `.github/workflows/ci.yml:77-81` — « Enforce front→server import boundary
  (A1 — apps/mail) » lance `pnpm dlx oxlint@1.9.0 --config packages/eslint-config/oxlint-frontier.json
  apps/mail`. Config = 1 règle `no-restricted-imports` sur `group ["**/server/src/**"]`, `correctness=off`.
- **POSITIF (arbre sain)** : commande du step exécutée localement → **RC=0**, « Found 0 warnings and
  0 errors » sur 356 fichiers, 1 règle. ✓ (oxlint 1.9.0 téléchargé par dlx, réseau dispo).
- **NÉGATIF (preuve d'efficacité — mon unique exception d'écriture, temporaire)** : sonde jetable
  `apps/mail/components/__judge_frontier_probe__.tsx` avec `import { secret } from '../../server/src/lib/secret'`
  → **RC=1**, `eslint(no-restricted-imports)` déclenché sur l'import, message frontière EXACT
  (« importez les contrats partagés depuis @zero/types … issue #25 »). Sonde **supprimée immédiatement**,
  `git status --porcelain` = seul ce rapport non-tracké (arbre propre). ✓

**VERDICT A1 : ATTESTÉ.** La frontière front→serveur est réellement gatée en CI : vert sur l'arbre
sain (RC=0), rouge sur un import interdit (RC=1). Le manquant « règle ESLint non active en CI » est
levé par un mécanisme oxlint équivalent et exécuté. (Le MANQUANT 2 « index de domaines » est classé
cosmétique documenté par le builder — cohérent avec le ruling A1 « pas de barrels inutilisés ».)

## 7. A8 (a8-weight-hunt) — **ATTESTÉ**

### Mesure gelée reproduite (build mail RC=0 préalable)
`python3 scripts/checks/measure-critical.py apps/mail` → **TOTAL 424 948 gz = 415,0 KiB gz** ;
**GATE ≤420 → PASS (marge 5,0 KiB)** ; **CHUNKS >900 KiB raw : NONE (PASS)**. ✓
Conforme exact à l'attendu (415,0 / marge 5,0). Note : le rapport interne builder porte 414,6 KiB ;
l'écart 0,4 KiB = déterminisme de build (hashes) — **les deux PASS**, le 415,0 est le chiffre
reproductible orchestrateur + juge.

### Absence de metric-gaming (inspection du diff a8, commit 99c191ba)
- **LEAD A — code-motion PUR** : nouveau `lib/email-utils-highlight.client.tsx` = `highlightText`
  **byte-identique** à la version retirée de `email-utils.client.tsx` (même escape/regex/split/map→spans/
  catch→log.warn). Le nouveau module n'importe QUE `@/lib/log` (dépendance-free). `mail-list-thread.tsx`
  (froid) redirige son seul import. **Aucun `React.lazy`, aucun `import()`, aucun preload** — l'éviction
  du graphe froid statique (zod/color/email-addresses/@react-email) est RÉELLE, pas différée-au-mount.
  Respecte f143abf9. **DOMPurify préservé statique** (`purify.es` présent dans les chunks froids mesurés). ✓
- **LEAD F — shortcuts.ts zod→interface** : vérifié que la version PRÉ-a8 (`99c191ba^`) n'avait
  **AUCUN `.parse`/`.safeParse`** — `shortcutSchema` n'était consommé que par `z.infer` (l.31).
  zod y était donc du poids runtime MORT. Remplacé par `interface Shortcut` (forme identique champ à
  champ), `import { z }` retiré. **Comportement runtime inchangé** (rien n'était parsé). Non-gaming. ✓
- **LEAD C — es2022** : un seul champ `build.target: 'es2022'` dans `vite.config.ts`. ✓

### Cold-start — libellé fidèle aux données brutes JSON
Médianes recalculées par le juge depuis `coldboot-{after,before}.json` :
- AFTER (HEAD) médiane **780,8 ms** (walls 730-849, σ 50,8) — reproduit exact.
- BEFORE (0e55cc09) médiane **807,3 ms** (walls 724-1203, 2 outliers 1114/1203, σ pop 187,0) — reproduit exact.
- **Δ (before−after) = +26,5 ms**, entièrement DANS le bruit (σ 187 côté BEFORE). Reproduit exact.
- Borne transfert : Δ bundle mesuré −193,6 KiB gz (629,5→435,9) → 193,6×1024×8/1,5e6 = **−1,06 s** @1,5 Mbps.
  Borne arithmétique, pas mesure runtime (FCP/LCP Tahiti BLOCKED).

Le libellé « **−1s NON acquis serveur, borne transfert client arithmétique** » est **FIDÈLE** aux
données brutes. Le doc écrit explicitement « ce n'est PAS −1 s » côté serveur et ne présente jamais
la borne transfert comme un cold-start prouvé.

**VERDICT A8 : ATTESTÉ.** 415,0 KiB gz PASS marge 5,0 (reproduit), zéro metric-gaming (code-motion
pur + suppression de zod runtime mort + es2022, measure-critical intouché), cold-start honnête
(−1s non acquis serveur, borne transfert documentée arithmétiquement).

## 8. A7 canary — gitleaks CI working-tree — **ATTESTÉ**

Commande exacte du workflow (docker, image épinglée v8.30.1, scope working-tree) :
`docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 dir /repo
--config /repo/scripts/checks/gitleaks.toml --no-banner --redact --exit-code 1`
→ **RC=0, « no leaks found »** (22,16 MB scannés). Mon rapport untracked n'a rien déclenché.
Le gate secrets est **VERT** sur l'arbre gelé. ✓ (binaire local aussi 8.30.1, versions alignées.)

## 9. LIBELLÉS — pas de sur-revendication dans la vague V7

- **« tous gates verts »** : les seules occurrences dans `a8-client-completion-01.md` (l.228/401)
  sont l'**INVERSE** d'un abus — le builder **refuse** de le dire tant que le poids >420
  (« Jamais “tous gates verts” : le gate poids reste FAIL »). `a2-nonnull-01.md` est aussi honnête
  (« Jamais un PASSED global tant que a3 n'a pas mergé »). Aucune livraison V7 ne revendique
  « tous gates verts » avec un gate BLOCKED/provisoire.
- **« durée prouvée » (A4)** : n'apparaît QUE comme l'interdiction dans le ruling (l.9). Aucun rapport
  ni merge ne la revendique. A4 n'est pas une livraison V7.
- **« cold-start −1s acquis »** : tous les libellés V7 (rapport a8, docs perf, merges 99c191ba/0bbfc2b8)
  disent explicitement « −1s NON acquis serveur ». Aucun abus.
- **Messages de merge V7 vérifiés factuels** : 93d2c7c8 (a2 : nonNull AST 0/0, tsc 0/0, 298+144 ×2),
  0bbfc2b8 (a8 : 415,0 KiB PASS marge 5,0, −1s non acquis), f5a77dc6 (a3-corrective : any 14/15 · 37/38
  PASSED, 298/298) — tous reproduits vrais par le juge.

**VERDICT LIBELLÉS : ATTESTÉ** (aucune sur-revendication V7).

---

## SYNTHÈSE — verdicts par livraison

| # | Livraison | Verdict | Preuve clé reproduite |
|---|---|---|---|
| — | SOCLE | **ATTESTÉ** | tsc 0/0 ; 298+144 tests ; 4 ratchets PASSED |
| 1 | a2-nonnull | **ATTESTÉ** (1 nuance) | AST 0 dans la fence (recompté indépendamment) ; 4 @ts-expect-error nominatifs ; 6 guards happy-path préservé |
| 2 | a1-frontier-ci | **ATTESTÉ** | step CI positif RC=0 / négatif RC=1 (import interdit → rouge) |
| 3 | a6-zod-mail | **ATTESTÉ** | 11 tests spa-fallback ; assertMailEnv au boot ; schéma z.custom fetcher réel |
| 4 | a5-front-console | **ATTESTÉ** | comptage front=6 verbatim ; warn/error non gatés (prod préservé) |
| 5 | a3-driver-coverage (+correctif) | **ATTESTÉ** | driver 58,69 % / All files 60,12 % (>50 % des 2 façons) ; microsoft.ts 0 % honnête |
| 6 | a8-weight-hunt | **ATTESTÉ** | 415,0 KiB gz PASS marge 5,0 ; zéro gaming ; cold-start −1s non acquis honnête |
| 7 | A7 canary (gitleaks) | **ATTESTÉ** | commande CI RC=0, « no leaks found » |

*(gitleaks-fix antérieur = hors périmètre de vague, exclu comme mandaté.)*

### Anomalies découvertes (mandat de pointer)
1. **A2 — couverture ratchet incomplète (mineur, pré-existant)** : 2 `NonNullExpression` réelles
   survivent en code produit dans `apps/mail/utils/keyboard-layout-map.ts:273,325`, **hors de la
   fence a2 ET hors du périmètre du type-ratchet**. Le ratchet ne garde donc pas 100 % du code
   produit (utils/, workers/, config/ non couverts pour le non-null). Elles sont **pré-existantes**
   (non introduites par a2) ; la cible barème « ≤10 » reste **atteinte même en comptant tout le
   produit** (2 ≤ 10). Impact : le libellé « 0 en code produit » est exact dans la fence mais
   littéralement large ; une régression future `x!` dans `utils/` ne serait pas détectée. Ne remet
   pas en cause le verdict A2.
2. **Libellé pré-V7 (hors périmètre, pointé pour cohérence)** : `a8-client-completion-01.md:4`
   crédite #31 d'avoir « PROUVÉ » le cold-start — phrasé plus lâche que le verdict V7 honnête
   (−1s NON acquis serveur) qui le contredit de facto ; `loc-outliers-01.md:216` dit « tous gates
   verts » (job pré-V7). Deux rapports antérieurs, non re-vérifiés ici, sans effet sur les livraisons V7.

### Verdict de vague
**VAGUE V7 : PASS.** Les 7 livraisons jugées sont ATTESTÉES sur l'arbre gelé `93d2c7c8`, chacune
par reproduction indépendante des preuves (RC natifs). Le socle est solide (tsc 0/0, 298+144 tests,
4 ratchets verts, gitleaks vert). Aucune sur-revendication dans les libellés V7. Une seule anomalie
mineure et pré-existante (couverture ratchet non-null hors fence), sans impact sur les verdicts ni
sur la cible barème. Chaque manquant par axe visé par la vague est réellement fermé : A1 (frontière
CI exécutée), A2 (non-null par guards réels), A3 (coverage driver >50 %), A5 (console front 6),
A6 (boot zod honnête du worker mail), A8 (JS critique ≤420 réel + cold-start honnête).
