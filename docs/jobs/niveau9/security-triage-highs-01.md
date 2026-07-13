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

- [ ] PHASE 0 : `pnpm audit --prod` du jour verbatim (RC natif), plan.
- [ ] `docs/research/niveau9/audit-triage.md` : une entrée par advisory high+moderate
      (package, chemin pnpm why, reachability, mitigation, owner) ; lows en tableau ;
      inclure l'entrée js-cookie@2.2.1 (ligne non couverte par l'override @3).
- [ ] Mapping advisory→override pour les 11 overrides du snapshot (justification une à une).
- [ ] Preuves post-bump : install, séquence types, tsc 0/0, pnpm test 121, tests
      auth/scopes, build mail, dry-run ×2 — RC natifs non masqués.
- [ ] Gitleaks HISTORIQUE branche (mode git), log conservé, RC natif.
- [ ] MIRROR: ORCHESTRATOR + STATUS final.
