# Job — security-triage-highs-01 (issue #37, V5.5) — SQUELETTE ORCHESTRATEUR

Squelette créé par l'orchestrateur après DEUX arrêts de builders (voir incidents).
Un éventuel -03 strictement borné remplit les sections « DÛ PAR -03 » sans toucher
aux sections d'incident ni à l'audit orchestrateur.

## Incident -01 (consigné par l'orchestrateur)

Le builder -01 a modifié `package.json` (11 overrides pnpm) + `pnpm-lock.yaml` SANS
rapport ni PHASE 0. STOPPÉ sur ordre superviseur. Snapshot :
`.architect/tmp/sec-triage-snapshot.diff` (690 lignes, sha256 `729c6454…9253`).

## Incident -02 — RÉCIDIVE (consigné par l'orchestrateur)

Le -02, dont le mandat exigeait rapport+audit+ACK AVANT toute action, a réédité la
violation : 4 fichiers modifiés (package.json ×3 + pnpm-lock.yaml, install exécuté)
toujours sans rapport ni ACK, malgré un ultimatum explicite (msg d7ec9f94). STOPPÉ.
Snapshot : `.architect/tmp/sec-triage-02-snapshot.diff` (541 lignes, sha256
`93c31791…c2d5a`). Pas de respawn immédiat : audit read-only orchestrateur ci-dessous.

## Audit read-only du snapshot -02 (orchestrateur, 2026-07-13)

Vérification de CHAQUE override contre les résolutions du lockfile GELÉ
(`git show HEAD:pnpm-lock.yaml`) — classe semver et périmètre :

| Override -02                 | Résolu au gel                  | Classe | Verdict lecture                                                                                                          |
| ---------------------------- | ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| protobufjs 7.6.5             | 7.5.5                          | minor  | semver-sûr                                                                                                               |
| fast-uri 3.1.3               | 3.0.6                          | minor  | semver-sûr                                                                                                               |
| path-to-regexp@8 → 8.4.2     | 8.2.0 (6.3.0 non visé, scoped) | minor  | semver-sûr, scope correct                                                                                                |
| jws@4 → 4.0.1                | 4.0.0                          | patch  | semver-sûr                                                                                                               |
| jws@3 → 3.2.3 (AJOUT -02)    | 3.2.2                          | patch  | semver-sûr — couvre la ligne 3.x que le -01 avait manquée                                                                |
| ~~defu 6.1.7~~ (RETRAIT -02) | 6.1.4                          | —      | retrait PRUDENT : defu est dans l'arbre better-auth (gelé 1.6.x) — le bump churnait better-auth ; diagnostic à préserver |
| flatted 3.4.2                | 3.3.3                          | minor  | semver-sûr                                                                                                               |
| preact 10.29.7               | 10.26.9                        | minor  | semver-sûr                                                                                                               |
| linkifyjs 4.3.3              | 4.3.1                          | patch  | semver-sûr                                                                                                               |
| linkify-it 5.0.2             | 5.0.0                          | patch  | semver-sûr                                                                                                               |
| js-cookie@3 → 3.0.8          | 3.0.5 (2.2.1 non visé)         | patch  | semver-sûr ; ⚠ la ligne js-cookie@2.2.1 reste non traitée → entrée de triage obligatoire (reachability + owner)         |
| tar-fs 2.1.5                 | 2.1.3                          | patch  | semver-sûr                                                                                                               |

Hors overrides : `@vitest/coverage-v8@3.2.7` ajouté aux devDependencies de
apps/mail + apps/server = exécution du RULING orchestrateur (routé depuis #35,
reproductibilité CI du check tests.md §3). Conforme.

AUCUN saut de majeure détecté. Contenu du snapshot : RECEVABLE en lecture.
Ce qui MANQUE (la raison d'être du process violé deux fois) : mapping advisory→override
(quel CVE chaque bump ferme), reachability prod par entrée, preuves post-bump
(tests/tsc/build/dry-run/auth-scopes), gitleaks historique, et `docs/research/niveau9/audit-triage.md`.

## DÛ PAR -03 (strictement borné — ne PAS réécrire ce qui précède)

Rempli par le builder -03 (exécutif). **Intégrité snapshot vérifiée au préalable** :
HEAD `79a41839`, branche `job/niveau9/security-triage-highs-01`, exactement 4 fichiers
modifiés (apps/mail/package.json, apps/server/package.json, package.json, pnpm-lock.yaml),
`git diff | shasum -a 256` = `93c31791958ed690…1d973c2d5a` — **identique** au snapshot -02
validé. Aucun des 4 fichiers touché ; **aucun override ajouté/retiré/modifié**.
Toolchain : node v22.22.3, pnpm 10.15.0.

- [x] **PHASE 0 — `pnpm audit --prod`** (RC natif). Install préalable
      `pnpm install --frozen-lockfile --ignore-scripts` → **RC=0** (lockfile modifié
      cohérent, pas de fallback non-frozen requis). `pnpm audit --prod` → **RC=1**
      (126 chemins = 122 advisories dédup : **48 high / 61 moderate / 13 low**).
      Logs : `.architect/tmp/{install-frozen,audit-prod}.log`, JSON `audit-prod.json`.
      Plan exécuté : mesure AVANT (worktree jetable détaché HEAD, sans les ajouts) →
      diff mesuré → triage reachability → preuves → gitleaks.
- [x] **`docs/research/niveau9/audit-triage.md`** créé : modèle de surface déployée,
      synthèse reachability par package, **une entrée par advisory high+moderate**
      (package, chemin `pnpm why`, reachability Workers avec fichier cité, mitigation,
      owner), lows en tableau compact, **entrée dédiée js-cookie@2.2.1** (§4 : chemin
      `apps/mail > react-use > js-cookie@2.2.1`, GHSA-qjx8-664m-686j, NOT-REACHABLE car
      `react-use` importé uniquement en ligne commentée, owner mail).
- [x] **Mapping advisory→override (11 overrides)** — preuve **mesurée AVANT→APRÈS**
      (`.architect/tmp/diff-before-after.txt`) : **21 advisories fermés (15 high,
      6 moderate), 0 régression**. Détail une-à-une en §5 du fichier de recherche.
      **9 overrides ferment effectivement** ; **2 patchs défensifs ne ferment aucun
      advisory mesurable → SIGNALÉS, non retirés** (décision propriétaire) :
      **jws@4 4.0.1** (0 advisory ligne 4.x) et **js-cookie@3 3.0.8** (la CVE js-cookie
      subsiste sur la ligne 2.2.1 hors scope `@3`). Le plus notable des fermés :
      **jws@3 3.2.3 → GHSA-869p-cjfg-cm3x** (vérification HMAC défaillante, sécurité auth),
      ligne 3.x que le -01 avait manquée et que le -02 a couverte.
- [x] **Preuves post-snapshot** (RC natifs bruts, séquentiels) : - install `--frozen-lockfile --ignore-scripts` → **RC=0** - `pnpm --filter @zero/server types` (wrangler types --env local) → **RC=0** - `pnpm --filter @zero/mail types` (wrangler types) → **RC=0** - `pnpm --filter @zero/mail exec react-router typegen` → **RC=0** - `tsc --noEmit` server → **RC=0, 0 erreur** · mail → **RC=0, 0 erreur** (**0/0**) - `pnpm test` (turbo→vitest) → **RC=0**, **121 tests** (mail 51/51 + server 70/70) - **scopes** : `apps/server/src/lib/google-scopes.ts` n'accorde que
      `gmail.modify`, `gmail.compose`, `userinfo.profile`, `userinfo.email` ;
      `mail.google.com` **absent des scopes** (unique occurrence = commentaire ligne 5
      documentant son exclusion volontaire). Pas de fichier de test scopes dédié ; la
      suite (121) inclut `mail-sanitize` et les drivers gmail, tous verts. - `pnpm --filter @zero/mail build` (react-router build) → **RC=0** (built 11.30s) - dry-run wrangler **server** (`--env local`, `--outdir …/dryrun-server`) → **RC=0** - dry-run wrangler **mail** (`--outdir …/dryrun-mail`) → **RC=0** - **better-auth** résolu = **1.6.23** (dans le gel 1.6.x, via `catalog:`), intact.
      Logs : `.architect/tmp/p{1..9}-*.log`.
- [x] **Gitleaks HISTORIQUE** (mode git). ⚠ La commande **verbatim** échoue en faux
      négatif dans ce worktree : le `.git` est un fichier pointant hors du mount docker
      (`gitdir: …/.git/worktrees/…`) → _« not a git repository »_, **0 commit scanné**
      (log `gitleaks-history-verbatim.log`, RC=0 trompeur). **Adaptation** (montage du
      `.git` réel à son chemin absolu) → scan réel de **3376 commits**, **RC=1**,
      **6 findings** (logs `gitleaks-history-A.log`, `gitleaks-findings.json`).
      Qualification (redigés) : **aucun** ne provient du snapshot ni des commits
      security-triage. 3 partagés avec `staging` (baseline amont Zero 2025, auteurs
      Adam/Aj Wazzan : `CLOUDFLARE_API_TOKEN` env.ts/wrangler.jsonc, `perplexity` — valeurs
      **vidées dans le HEAD courant**) ; 3 branch-uniques faux positifs (Thomas 2026-07-13 :
      `freeze_sha:` = SHA git ×2 pris pour clé générique ; `.dev.vars.example` = placeholders
      **tous vides**). Working tree courant : **propre**.
- [x] **MIRROR: ORCHESTRATOR** · **STATUS: COMPLETE_WITH_CONCERNS**.

### Concerns (surface pour arbitrage — hors action -03)

1. **Gitleaks historique non vide** : 6 findings (RC=1), tous qualifiés bénins/hérités/faux
   positifs et hors périmètre de ce job. La commande verbatim du mandat est inopérante en
   worktree (montage docker) et a dû être adaptée — signalé pour correction du checkrun.
2. **Advisories runtime résiduels REACHABLE non fermés par le snapshot** (owners assignés,
   bumps hors périmètre -03) : **dompurify** (mail, sanitisation HTML email — prioritaire),
   **effect** (server, contexte AsyncLocalStorage/RPC), **agents** (server/mail),
   - traîne REACHABLE-LOW. **defu** (high) reste ouvert car gelé better-auth 1.6.x
     (override retiré à dessein par le -02). Aucun n'autorise un bump par -03.
