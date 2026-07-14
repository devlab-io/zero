# Niveau 9 — Architecture 9/10 : spec gelée du run

Status: APPROVED in-session · Date: 2026-07-12 (Pacific/Tahiti) · Run: niveau9
Branche: `factory/niveau9` (coupée de `factory/niveau8` @ `23359642`)

## Outcome

Porter l'architecture du fork devlab-io/zero — au sens large : santé structurelle du code ET
fondations perf/robustesse/sécurité déjà cataloguées — à une note de **9/10**, constatée par un
juge froid indépendant sur un barème gelé de 10 axes. Critère de réussite : **moyenne ≥ 9,
aucun axe < 7**, baseline et notation finale au même protocole.

## Non-goals

- Aucun déploiement, mutation de données prod, changement OAuth-console, envoi de mail réel
  (hard stops permanents — confirmation explicite de Thomas requise, toujours).
- Pas de réécriture clean-room des 9 fichiers sous en-tête restrictif « Zero Email Inc. » —
  l'axe A10 note la posture documentée, pas la disparition des en-têtes (voir A10).
- Pas de bump majeur de better-auth (gelé à 1.6.23, validé par security wave 1 niveau8).
- Pas de multi-tenant, pas de redistribution du fork.
- La comparaison chiffrée vs Shortwave reste BLOCKED si la session Shortwave authentifiée est
  indisponible — jamais estimée (règle niveau8 reprise).

## Approval record

Approbation in-session (forme 1 du protocole), enregistrée verbatim :

1. Demande initiale de Thomas (2026-07-12, session Jarvis) :
   « fais le mega plan damelioration de larchitecture du projet pour atteidnre 9/10 »
2. Arbitrages de cadrage (AskUserQuestion, 4 réponses) :
   - Périmètre → « Architecture au sens large (Recommended) »
   - Barème → « Barème gelé + juge froid (Recommended) »
   - Branche → « Nouveau run sur base niveau8 (Recommended) »
   - Exécution → « Factory complète (Recommended) »
3. Plan d'exécution complet approuvé via plan-mode : « User has approved your plan. »
   (plan archivé : `~/.claude/plans/peppy-marinating-backus.md`, contenu repris dans cette spec).

Cette approbation autorise le travail repo + tracker du run niveau9. Elle n'autorise aucun des
hard stops ci-dessus.

## Assumptions

- **AS-1** : la note finale = moyenne arithmétique des 10 axes du barème (`docs/checks/niveau9/grading-rubric.md`),
  paliers binaires appliqués sans interprétation par le juge froid.
- **AS-2** : A10 à 9 = posture licence documentée (inventaire, interdiction de redistribution,
  plan de sortie chiffré), PAS réécriture des fichiers restrictifs. Assumé : refactorer en lisant
  le code produit une œuvre dérivée ; les en-têtes sont préservés sur tout module dérivé.
- **AS-3** : le lot clavier non commité du worktree `/Users/thomasverdenne/cc/zero-niveau8`
  (13 fichiers, décrit dans `docs/runs/niveau8/HANDOFF.md` §« Lot local en cours ») est de la
  matière première NON validée : l'issue keyboard-parity peut le consulter en lecture seule mais
  doit tout re-dériver et re-vérifier dans son propre worktree.
- **AS-4** : les suppressions stagées non commitées du checkout principal (`~/cc/zero`, 11 binaires
  publics : fonts Geist, homepage-image.png, purple-gradient.png) restent intouchées ; l'issue
  client-weight refait la purge médias proprement sur la branche du run.
- **AS-5** : l'e2e en CI avec credentials Gmail réels est hors de portée d'un fork self-host sans
  compte de test dédié → la cible A3 est 8,5, dit explicitement dans le barème.
- **AS-6** : la dette tsc réelle peut dépasser les ~189 erreurs comptées (génération `wrangler
  types`, flags) ; soupape : `@ts-expect-error` budgétés par RULING, comptés par ratchet, pénalité
  A2 explicite (9→8) s'il en reste en fin de run.

## Validation strategy — barème gelé, 10 axes

Protocole : un **juge froid** (agent sans accès à l'historique du run — uniquement le repo, ce
barème et les commandes de preuve qu'il exécute lui-même) note les 10 axes au début du run
(`docs/runs/niveau9/baseline-grading.md`) et à la fin (`docs/runs/niveau9/final-grading.md`).
Chaque axe définit les paliers 7 et 9 en critères binaires. Barème intégral et commandes de
preuve : `docs/checks/niveau9/grading-rubric.md` (LE check maître, gelé).

| Axe | Baseline estimée | Cible | Palier 9 (résumé) |
|---|---|---|---|
| A1 Frontières & modularité | 3 | 9 | 0 import percé + règle CI ; `@zero/types` consommé ×2 apps ; 0 fichier src >800 LOC (ratchet) ; routage Hono/tRPC dédoublonné par ADR ; components/ par domaine |
| A2 Type safety | 3 | 9 | 0 erreur tsc ×2 apps (après `wrangler types`) ; typecheck CI bloquant ; `any` ≤40, 0 `@ts-nocheck`, assertions ≤10, ratchet non croissant |
| A3 Tests & vérifiabilité | 1,5 | 8,5 | `pnpm test` réel via turbo, vert en CI bloquante ; ≥120 tests ; couverture ciblée : driver Gmail (fake client), trpc/mail, reducers optimistes, auth, env, registre raccourcis ; e2e documenté local |
| A4 CI/CD & gates | 3 | 9,5 | CI PR : frozen install, wrangler types + typecheck, tests, lint unifié épinglé, audit critical, check-agent-surface, gitleaks, build + dry-run ×2, ratchets ; gate deploy (fin du force-push sans CI verte) ; <15 min |
| A5 Observabilité & erreurs | 2,5 | 8,5 | `console.*` serveur ≤20 / front ≤40 (ratchets) ; 0 catch-swallow ; taxonomie d'erreurs tRPC/Hono testée ; Sentry Worker actif ; tracing implémenté ou supprimé par ADR |
| A6 Données, migrations & config | 4 | 9,5 | Journal Drizzle == disque (42/42, 0 orphelin, check CI ; jamais renuméroter l'appliqué) ; 2ᵉ config drizzle statuée par ADR ; env validé zod au boot ×2 workers ; `db:push` gardé |
| A7 Sécurité | 6 | 9 | `docs/checks/niveau8/security.md` PASS intégral : 0 critical ; 100 % des high+moderate triés (package/path/reachability/mitigation/owner) ; gitleaks CI + historique de branche |
| A8 Performance structurelle | 4 | 9 | Gates `docs/checks/niveau8/performance.md` : 0 N+1 liste, 1 req liste + ≤1 body, payload ≤120 KiB/50 lignes, JS critique ≤420 KiB gz ; batch Gmail ~2000→≤100 appels/cycle ; public/ allégé (~58 MB) ; cold start −1 s mesuré |
| A9 Robustesse | 3 | 8,5 | Gates `docs/checks/niveau8/robustness.md` : 4 états par surface, retry lectures ≤2 expo+jitter, brouillon durable, optimistes réconciliées visibles/rejouables, soak 30 min |
| A10 Docs, gouvernance & conformité | 2,5 | 9,5 | ARCHITECTURE.md exact vérifié contre le code ; ≥6 ADRs ; README corrigé (React Router 7) ; FORK.md à jour ; LICENSE-NOTES.md (posture + plan de sortie) ; dette statuée (driver Microsoft, @zero/testing, @zero/cli) |

Moyenne cible : 9,1 (marge 1 pt ; upside A7/A4). Si un axe menace <7 en cours de run :
issue corrective dédiée, jamais de marchandage de barème.

## Domain language

- **Structurel** : issue dont le critère maître est « comportement strictement inchangé »
  (tests verts, snapshots de contrat identiques, dry-run OK). **Comportemental** : issue qui
  change un comportement observable, gated par un check gelé.
- **Ratchet** : compteur CI non croissant (LOC par fichier, erreurs tsc, `any`, `console.*`),
  gelé avec liste d'exceptions explicite.
- **Juge froid** : agent orchestrator-tier sans contexte du run.
- **Projection riche** : payload de liste construit depuis le SQLite des DO
  (latest_subject/sender/received_on) sans corps de messages.
- **Toucheur lockfile** (🔒) : la seule issue d'une vague autorisée à modifier
  `pnpm-lock.yaml`/`package.json` ; mergée en premier, les autres rebasent avant jugement.

## Delivery waves — 25 issues, 7 vagues

Règles : ≤5 builders parallèles, worktrees isolés, un juge froid par issue ; jamais deux issues
d'une vague sur le même fichier ; structurel avant comportemental sur les mêmes fichiers, avec
edge bloquant.

- **V0 Harnais** : `test-harness` 🔒 → `ci-and-deploy-gates`. Baseline de notation AVANT dispatch.
- **V1 Dette bloquante** : `tsc-zero-mail`, `tsc-zero-server`, `deps-catalog` 🔒,
  `migrations-repair`. Sortie de vague : flip typecheck CI en bloquant.
- **V2 Structurel serveur** : `refactor-agent-do`, `refactor-google-driver`,
  `routing-consolidation`, `shared-types-package` 🔒.
- **V3 Structurel front + garde-fous** : `refactor-mail-list-data`, `refactor-thread-composer`,
  `refactor-shell-palette`, `server-runtime-guardrails`.
- **V4 Comportemental data/clavier/poids** : `w2a-list-projection`, `w2f-gmail-hotpath`,
  `w2e-keyboard-parity`, `w2cd-client-weight`.
- **V5 Robustesse/tests/API/i18n/triage** : `w2b-robustness`, `tests-core-coverage`, `w2g-i18n`
  (sacrifiable, impact ≤0,25 pt), `agent-api-completion`, `security-triage-highs` 🔒.
- **V6 Consolidation** : `docs-architecture-adr`, `final-qa-bench`.
- **Jugement final** : re-notation 10 axes, digest, PR unique `factory/niveau9`→staging
  (non mergée sans feu vert de Thomas ; aucun deploy).

Edges principaux : V0.1→V0.2 ; V1.3→(rebase V1.1/V1.2) ; V1→flip typecheck ;
V2.1→V4.1→V5.1/V5.4 ; V2.2→V4.2 ; V2.3→V3.4/V4.2 ; V3.1→V4.1 ; V3.2/V3.3→V4.3 ; V3.3→V4.4 ;
V4.*→V5.2 ; V5.*→V6.2. Chemin critique : V0.1→V0.2→tsc-server→refactor-agent-do→
w2a-list-projection→w2b-robustness→final-qa-bench→jugement.

Le détail par issue (acceptation, may-touch/must-not-touch) vit dans les sub-issues tracker,
compilées depuis cette spec.

## Checks

- Les 6 checks `docs/checks/niveau8/` restent normatifs, gelés, inchangés (security, performance,
  robustness, keyboard-parity, agent-api, visual-qa).
- Nouveaux checks gelés `docs/checks/niveau9/` : `grading-rubric.md`, `structure.md`,
  `typecheck.md`, `tests.md`, `observability.md`, `data-config.md`, `ci-deploy.md`,
  `docs-governance.md`. Gel au tag `freeze/niveau9-v1` ; toute modification ultérieure d'un gate
  = RULING documenté sur la tracking issue.

## Preflight evidence

- Mode github : remote `origin=https://github.com/devlab-io/zero.git`, `gh auth status` PASS
  (compte tomatozor), `gh 2.96.0` ≥ 2.94.0.
- Branche `factory/niveau9` coupée de `factory/niveau8` @ `23359642` ; worktree de run
  `.architect/runs/niveau9` ; `.gitignore` réparé (ligne corrompue `tools.json.architect/`
  scindée) ; corpus d'audit `docs/research/revue-perf-ux*` cherry-pické depuis `factory/perf`
  @ `94f05128`.
- Oddities enregistrées : lot clavier non commité dans `~/cc/zero-niveau8` (AS-3) ; suppressions
  stagées non commitées dans `~/cc/zero` (AS-4) ; run niveau8 clos par commentaire sur #11,
  reliquat absorbé par ce run.
- Config dispatch (`.architect/config`) : orchestrator claude/best, builders claude/best (Fable,
  effort high), tier-down sonnet pour éditions mécaniques triviales ; juges orchestrator-tier ;
  canary backend à exécuter avant le premier dispatch.

## Open human decisions

Aucune — les 4 arbitrages de cadrage sont enregistrés dans l'approval record. Les hard stops
restent des décisions humaines permanentes.
