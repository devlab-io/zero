# Job — docs-architecture-adr-01 (issue devlab-io/zero#39, V6.1)

- **Worktree** : `.architect/wt/niveau9/docs-architecture-adr-01`
- **Branche** : `job/niveau9/docs-architecture-adr-01`
- **HEAD (gel)** : `1c82b196cbc87d629b18024cca3f4ac6b7372af2` — vérifié conforme.
- **Check gelé** : `docs/checks/niveau9/docs-governance.md` (7 points + 3 RUN) — lu intégralement.
- **Contrat de dette** : `docs/jobs/niveau9/docs-architecture-adr-01-rulings.md` — lu intégralement.
- **Nature** : docs-only. Aucun fichier de code ne sera touché.

Ce document est la **PHASE 0** : plan d'exécution + inventaire des livrables (fichier → contenu → source
de vérité vérifiée) + désaccords. Aucune écriture de doc de gouvernance n'est faite avant ACK
orchestrateur (règle STAND-DOWN du run).

---

## 0. Constats d'entrée vérifiés (par lecture, ce tour)

| Constat | Vérification | Conséquence plan |
|---|---|---|
| `ARCHITECTURE.md`, `FORK.md`, `LICENSE-NOTES.md` **n'existent pas** | `ls` racine | à **créer** intégralement |
| `README.md`, `AGENT.md`, `MCP.md`, `docs/testing.md` existent | `ls` | à **corriger** |
| `docs/adr/` : 7 fichiers ADR `.md` (+ 2 JSON d'inventaire, non-ADR) | `ls docs/adr/` | ≥6 déjà satisfait en nombre ; substance à compléter |
| `docs/solutions/` : 1 seul fichier (`migrations-drift.md`) | `ls docs/solutions/` | 6 familles + known-issues à écrire |
| **grep `Zero Email Inc` apps packages = 22** (pas 9) | `grep -rl … \| wc -l` | écart à **justifier dans LICENSE-NOTES.md** (le check l'autorise explicitement) |
| dont **20 en-têtes avec clause restrictive** + **2 mentions** (`footer.tsx` UI, `instrument.ts` commentaire Devlab) — *corrigé en PHASE 1 : `instrument.ts` n'est pas un en-tête* | `grep "Reuse or distribution"` + `head` | inventaire scindé header vs mention |
| `README` : `Next.js` = 1 occurrence (ligne 33, stack courante) | `grep -n Next.js` | à corriger → React Router 7 |

### 0.1 Détail de l'écart licence (9 → 22) — cœur du point 5

La ligne RUN attend `9`. Le HEAD gelé donne `22`. **Ce n'est pas une violation** : c'est la
conséquence documentée de l'**AS-2** de la tracking issue #13 (« PAS de réécriture clean-room des 9
fichiers restrictifs ; en-têtes préservés sur modules dérivés »). Le run a **éclaté** le god-file du
DO agent (#22 refactor-agent-do, mergé `ce010215` — 2262 LOC → 12+ modules) et le driver Google, et
**chaque module dérivé a préservé son en-tête** — exactement la règle exigée. Le `9` du check est le
compte d'**origine** (pré-run) ; le `22` est le compte **post-run au gel**. La justification chiffrée
ira dans `LICENSE-NOTES.md`.

Inventaire des 22 (vérifié — corrigé en PHASE 1, la clause verbatim fait foi) :
- **20 en-têtes porteurs de la clause restrictive** (`grep "Reuse or distribution of this file requires a license from Zero Email Inc"` → 20) :
  `apps/server/src/lib/analyze/interests.ts` ;
  `apps/server/src/routes/agent/{index,internal,chat-agent,shard-registry,mcp,mcp-tools,mcp-tools.test,errors,labels,sync,recipients,outbox,topics,zero-driver,projection}.ts` (15) ;
  `apps/server/src/thread-workflow-utils/{workflow-engine,workflow-functions}.ts` ;
  `apps/server/src/workflows/{sync-threads-workflow,sync-threads-coordinator-workflow}.ts`.
- **2 mentions (non en-têtes)** : `apps/mail/components/home/footer.tsx` (branding UI `© … All Rights Reserved`) ;
  `apps/mail/app/instrument.ts` (commentaire Devlab sur le DSN Sentry upstream — jamais un en-tête, déjà un commentaire à la baseline `23359642`).

### 0.2 Anomalies de numérotation ADR — cœur du point 2 + ruling §1

Vérifié par lecture des H1 :
- `0002-routing-hono-vs-trpc.md` porte en **titre interne** « # ADR **0001** — One routing layer… » (filename `0002` ≠ H1 `0001`).
- **Double `0004`** : `0004-shared-types-package.md` ET `0004-structured-logger.md` (deux ADR au même numéro).

Numéros existants effectifs : 0001, (0002 mislabelé 0001), 0003, 0004×2, 0005, 0006. **Règle du run :
JAMAIS renuméroter un ADR existant.** Résolution : **note d'ADR** (index `docs/adr/README.md`)
consignant la cartographie canonique + les collisions, sans toucher aux fichiers. Les **nouveaux ADR
démarrent à 0007**.

---

## 1. Inventaire des livrables (fichier → contenu → source de vérité)

### Documents racine

| Fichier | Action | Contenu prévu | Source de vérité (vérifiée) |
|---|---|---|---|
| `ARCHITECTURE.md` | **créer** | apps (`mail`, `server`) / packages (`cli`, `types`, `testing`, `eslint-config`, `tsconfig`) ; couches serveur (Hono routing vs tRPC vs DO agent vs workflows) ; flux Gmail → DO SQLite → projection → client ; frontières & exports publics ; environnements. Chaque affirmation cite un chemin réel. | seams vérifiés : `apps/mail/hooks/use-mail-list-data.ts`, `apps/mail/components/mail/mail-list.tsx`, `apps/server/src/routes/agent/projection.ts`, `apps/server/src/lib/draft-outbox/`, `apps/server/src/trpc/routes/outbox.ts`, `apps/server/src/lib/logger.ts`, `apps/server/src/lib/tracing.ts`, `apps/mail/workers/spa-fallback.ts`, `apps/mail/components/mail/mail-lazy-surfaces.tsx` ; ADR 0001/0002/0004a |
| `README.md` | **corriger** | ligne 33 `Next.js` → **React Router 7** ; « Tech Stack » : runtime **Cloudflare Workers** (wrangler), stockage dual **Postgres/Drizzle (données app) + DO SQLite/R2 (sync email)** ; liens vers `ARCHITECTURE.md` + `docs/testing.md`. Getting-started **inchangé** (commandes déjà réelles). | `apps/mail/package.json` (`dev: react-router dev`) ; README §Sync (l.269-276) ; scripts racine vérifiés (`docker:db:up`, `nizzy env/sync`, `db:push`, `dev`) |
| `FORK.md` | **créer** | divergences vs upstream Mail-0/Zero : surface MCP, CI (`quality-and-security` + ratchets + deploy gate), structure (DO agent éclaté, `@zero/types`, boundary tRPC) ; interdiction de redistribution (renvoi LICENSE-NOTES). | `git remote` (upstream `Mail-0/Zero`) ; `docs/testing.md` §CI ; ADR 0002/0004a/0006 |
| `LICENSE-NOTES.md` | **créer** | inventaire exact 22 (21 en-têtes + 1 mention `footer.tsx`) ; **justification écart 9→22** (AS-2, modules dérivés) ; règle de préservation des en-têtes (`workflow-*`, `sync-threads-*`, `routes/agent/*`, `driver/google*`) ; interdiction de redistribution (miroir README/FORK) ; **plan de sortie chiffré** (clean-room / accord upstream). | grep gelé (22) ; issue #13 AS-2 ; ruling §5 |
| `AGENT.md` | **corriger** | corriger faux : `Next.js`→React Router 7 ; retirer `apps/ios-app/` (inexistant) et `packages/db/` (inexistant) → `packages/{cli,types,testing,eslint-config,tsconfig}` ; commandes fantômes (`test:ai`, `eval:ci`) → scripts réels. | `ls apps/ packages/` ; `package.json` scripts |
| `MCP.md` | corriger (léger) | fautes (`connecto`, `Capabilties`) ; refléter surface MCP réelle (`routes/agent/mcp.ts`, `mcp-tools.ts`). Priorité basse. | `apps/server/src/routes/agent/mcp*.ts` |

### ADR (`docs/adr/`)

| ADR | Action | Décision documentée | Source |
|---|---|---|---|
| `README.md` (index) | **créer** | cartographie canonique + note de collision (0002 H1=0001, double 0004) ; **sans renumérotation** | lecture H1, ruling §1 |
| 0001–0006 existants | **inchangés** | déjà en place (drizzle DO, routing, tracing, @zero/types, logger, sentry, trpc-boundary) | fichiers lus |
| `0007-do-agent-decomposition.md` | **créer** | éclatement god-file DO agent (2262→12+ modules ≤496, barrel `index.ts`, projection nommée), équivalence AST 36/36 exports · 55/55 méthodes | issue #13 comment (#22, `ce010215`) ; `routes/agent/projection.ts` |
| `0008-agent-error-taxonomy.md` | **créer** (si substance confirmée à l'écriture) | taxonomie d'erreurs agent | `routes/agent/errors.ts`, `driver/utils.ts` (`StandardizedError`/`FatalErrors`) |
| `0009-license-posture.md` | **créer** | posture licence : préservation en-têtes, pas de clean-room, interdiction de redistribution | issue #13 AS-2 ; ruling §5 |
| `0010-testing-strategy.md` | **créer** | stratégie de tests (unit vitest / e2e Playwright local) + **statut @zero/testing** (conservé e2e) + **statut @zero/cli** (consommé nizzy/postinstall) | `docs/testing.md` ; ruling test-harness-01 §14 ; `package.json` (`nizzy`, `postinstall`) |
| `0011-microsoft-driver-frozen.md` | **créer** | garder/geler le driver Outlook, exception loc-ratchet, **conséquence produit** (Gmail = chemin actif) | `apps/server/src/lib/driver/microsoft.ts` (1291 LOC) ; ruling docs §2 |

→ Après run : **12 fichiers ADR** (7 existants + index + 5 nouveaux). Points 2 et 6 couverts.

### Solutions (`docs/solutions/`) — ruling §3 & §4

| Fichier | Diagnostic consommé | Source |
|---|---|---|
| `env-tsc-phantoms.md` | node_modules worktree + séquence codegen obligatoire (`wrangler types` ×2 + `react-router typegen`) | `docs/testing.md` §CI pt 2 |
| `prettier-vs-lockfile.md` | hook reformate `pnpm-lock` → `--no-verify` + `ensure_ascii=False` | ruling §3 |
| `zsh-word-split.md` | fichier parasite locales (word-splitting zsh) | ruling §3 |
| `authorizations-off-channel.md` | incident #44 : toute autorisation cite ID+source, confirmation canal factory | ruling §3 |
| `honest-labeling.md` | jurisprudence « jamais poids OK », formulation unique des gates | ruling §3 ; issue #13 comment (l.523) |
| `anti-metric-gaming.md` | `f143abf9` : mesure statique ≠ octets réseau | ruling §3 |
| `known-issues.md` | (1) `gen-trpc-boundary` diverge du snapshot committé (#40) ; (2) guard agent-surface = denylist par nom (inhérent) ; (3) fix `gitleaks` worktree (mode git + montage `.git`) | ruling §4 |

→ Point 7 : aucun docs-debt du digest ne reste orphelin (6 familles + 3 known-issues mappées).

---

## 2. Désaccords / points d'attention (obligatoire PHASE 0)

1. **RUN licence `9` vs réel `22`** — je **ne modifie pas le code** pour « revenir à 9 ». Je documente
   l'écart dans `LICENSE-NOTES.md` (voie explicitement permise par le check). Si l'orchestrateur veut
   le compte `9` littéral, cela impliquerait de dé-dériver des modules — **contraire à l'AS-2**. Je
   recommande la justification documentée. Confiance : élevée (AS-2 opposable).
2. **Numérotation ADR** — collision `0004` et mislabel `0002/0001` **préexistants au gel**. Je ne
   renumérote pas (règle du run). Risque résiduel : un juge froid comptant les « numéros distincts »
   pourrait voir < fichiers. Mitigation : index `docs/adr/README.md` + nouveaux ADR à 0007. Signalé
   pour visibilité.
3. **AGENT.md faux** (`Next.js`, `apps/ios-app/`, `packages/db/`, `test:ai`) — hors des 7 points du
   check mais **dans le may-touch** et **contredit par le code**. Je le corrige par honnêteté (doc de
   gouvernance lue par les agents). Si l'orchestrateur préfère le laisser hors périmètre, je m'aligne.
4. **README « Tech Stack » plus large que `Next.js`** — « Backend Node.js / Database PostgreSQL » est
   partiellement périmé (runtime = Cloudflare Workers ; stockage email = DO SQLite + R2). Je corrige au
   réel plutôt que le seul mot `Next.js`, sinon la stack resterait fausse.
5. **ADR 0008 (taxonomie d'erreurs)** — j'écris cet ADR **seulement si** `routes/agent/errors.ts`
   porte une taxonomie substantielle (à confirmer en lecture à l'écriture). Sinon je replie la décision
   dans ARCHITECTURE.md pour ne pas fabriquer un ADR creux (un ADR contredit/creux = FAIL).
6. **MCP.md** — priorité basse ; correction légère uniquement (les capacités décrites restent globalement
   exactes). Ne bloque aucun point du check.

---

## 3. Gates (auto-vérification avant remise)

- `git diff --check` propre ; **aucun fichier code touché** (docs-only).
- Chaque chemin cité vérifié par `test -f` avant écriture.
- README/AGENT getting-started : commandes = scripts réels de `package.json`.
- `ls docs/adr/*.md | wc -l` ≥ 6 (déjà 7, sera 12+).
- LICENSE-NOTES contient l'inventaire + justification de l'écart 22 (satisfait la clause RUN).
- ADRs : chacun contexte/décision/conséquences, référencé à une issue/ruling, non contredit par le code.

---

## 4. PHASE 1 — Exécution (post-ACK orchestrateur, 4 arbitrages rendus)

ACK reçu (les 4 arbitrages APPROUVÉS). Documents écrits / mis à jour :

| Fichier | Action | Source de vérité |
|---|---|---|
| `ARCHITECTURE.md` | créé | seams vérifiés + wrangler.jsonc (8 DO, 2 workflows, R2/Vectorize/KV/Hyperdrive), `main.ts`, `trpc/index.ts` (`appRouter`), `react-router.config.ts`, `spa-fallback.ts`, `use-mail-list-data.ts`, `projection.ts` — 84/86 chemins cités existent, les 2 autres cités comme inexistants |
| `LICENSE-NOTES.md` | créé | grep gelé (22) + baseline `23359642` (9) + mapping origine→dérivés par git (`1b93aa02` #22, `cd6148c3` #36) |
| `FORK.md` | créé | `git remote`, `docs/testing.md` §CI, ADR 0001-0011 |
| `README.md` | corrigé | stack réelle (Next.js retiré → RR7, grep=0) + liens ARCHITECTURE/testing/FORK/LICENSE-NOTES |
| `AGENT.md` | corrigé | faux retirés (ios-app, packages/db, test:ai/eval:ci, Next.js) vs `ls`/`package.json` |
| `MCP.md` | corrigé | fautes + pointeur `routes/agent/mcp.ts`+`mcp-tools.ts` |
| `docs/adr/README.md` | créé | index + note collisions (double 0004, 0002 H1=0001) |
| `docs/adr/0007..0011` | créés | #22, #29, #13/AS-2, #21, #23 (chacun context/décision/conséquences, référencé) |
| `docs/solutions/*` (6) + `known-issues.md` | créés | ruling §3-4, commits `f143abf9`, `063fd425`, configs réelles |

### Décisions prises pendant l'exécution (traçabilité)

1. **Licence — écart 9→22 (arbitrage #1).** Lignée établie par git : baseline `23359642` = **9**
   fichiers ; HEAD = **22** = 9 originaux (tous survivants) + **13 dérivés** (`index.ts`→11 via #22
   `1b93aa02`, `mcp.ts`→2 via #36 `cd6148c3`). Mapping origine→dérivés dans `LICENSE-NOTES.md` §3 →
   A10 littéralement satisfaisable.
2. **Licence — formulation sûre (correction orchestrateur `40dbe2d8`).** Constaté : LICENSE racine =
   **MIT** ; **20 fichiers** portent un en-tête Apache 2.0 **+ une clause additionnelle restrictive**
   verbatim `Reuse or distribution of this file requires a license from Zero Email Inc.` (index.ts:14) ;
   footer.tsx + instrument.ts = **mentions** (branding UI / commentaire Devlab), pas des en-têtes. La
   portée/le conflit de cette coexistence **ne sont pas tranchés** dans les docs (une revue juridique
   le ferait ; l'Apache 2.0 permet des termes additionnels sur les dérivés). Posture opérationnelle
   **stricte** : PAS de redistribution / relicensing / stripping sans permission écrite upstream OU
   revue juridique. Appliqué dans LICENSE-NOTES.md, ADR 0009, FORK.md, README.md.
3. **ADR 0008 (arbitrage #4).** Substance confirmée (`lib/errors.ts` 151 LOC codes stables +
   `routes/agent/errors.ts` 235 LOC erreurs Effect) → **ADR écrit**, pas replié.
4. **Numérotation (arbitrage #2).** Zéro renumérotation ; index + note ; nouveaux à 0007.
5. **AGENT.md (arbitrage #3).** Corrigé.

### Gates finaux (vérifiés)

- `git diff --check` propre ; **aucun fichier code touché** (git status : seuls docs).
- RUN : grep `Zero Email Inc` = 22 (justifié LICENSE-NOTES) ; README `Next.js` = 0 ; `ls docs/adr/*.md` = 13 (≥6).
- Chemins cités : 84/86 existent (`test -e`) ; 2 cités explicitement comme inexistants.
- Getting-started README/AGENT = scripts réels de `package.json`.

Pas de commit (règle du run). STAND-DOWN à la remise.
