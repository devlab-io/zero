# Final QA mécanique — Niveau 10

MIRROR: BUILDER final-qa-01

BASELINE / FREEZE: `6844acd969c8048c9a6b145740324323a0c96695`

CHECK: `docs/checks/niveau10/final-qa.md`

RULINGS: `docs/jobs/niveau10/final-qa-rulings.md`

SCOPE: preuve mécanique uniquement ; aucun changement produit, spec, check ou ruling ; aucun
Computer Use, OAuth, envoi, déploiement réel, commit ou push

## PHASE 0

- Plan exécuté : préparer le worktree frais, exécuter les sept RUNs exacts dans l'ordre,
  inspecter chaque sortie, vérifier explicitement le typecheck bloquant server/mail, le dry-run
  sans déploiement et la surface agent, puis publier ce rapport sans corriger le produit.
- Le ruling CAS fail-closed est conservé : cette QA ne prétend pas qu'un provider actif supporte
  la mise à jour sûre du même brouillon.
- La frontière OAuth persistante est conservée : aucune connexion ou approbation OAuth live n'a
  été tentée.

## Préparation déterministe

- Worktree initial propre ; HEAD égal au freeze.
- `pnpm install --frozen-lockfile` : exit 0 ; lockfile inchangé. Le postinstall a créé le `.env`
  local gitignored attendu.
- Premier essai `pnpm test` : exit 1, avec l'artefact Paraglide absent et le test serveur décrit
  ci-dessous déjà rouge.
- `pnpm --filter @zero/mail exec react-router typegen` : exit 0. Les sept RUNs autoritatifs ont
  ensuite été redémarrés depuis le premier et exécutés dans l'ordre.

## RUN 1 — tests complets

COMMAND: `pnpm test`

EXIT: 1

OUTPUT DÉCISIF:

```text
@zero/server:test: FAIL src/lib/driver/google-drafts.test.ts >
  GmailDrafts.listDrafts > récupère chaque brouillon, trie par date décroissante,
  remonte le pageToken
AssertionError: expected null to be 'thr-new'
apps/server/src/lib/driver/google-drafts.test.ts:192:38
Test Files  1 failed | 26 passed (27)
Tests       1 failed | 323 passed (324)
Failed: @zero/server#test
```

L'échec est déterministe : il s'est reproduit avant et après la génération Paraglide. Le fixture
`users.drafts.get` renvoie `message.id` mais pas `message.threadId`, tandis que
`GmailDrafts.listDrafts` projette `historyId: draft.threadId ?? null`; l'attente `thr-new` reçoit
donc `null`. Aucun de ces fichiers n'a été modifié dans cette QA.

Le runner Turbo interrompt le résumé mail quand le serveur échoue. Diagnostic non-mutant séparé :

```text
pnpm --filter @zero/mail test
EXIT: 0
Test Files  28 passed (28)
Tests       196 passed (196)
```

Warnings/bruit de test observés : `KeyboardLayoutMap API is not supported in this browser` et les
logs d'erreur attendus du scénario de retry `use-optimistic-actions`; ils ne font pas échouer la
suite mail.

## RUN 2 — format et lint globaux

COMMAND: `pnpm check`

EXIT: 2

OUTPUT DÉCISIF:

```text
> pnpm run check:format && pnpm run lint
> prettier . --check
Error occurred when checking code style in 2 files.
ELIFECYCLE Command failed with exit code 2.
```

Diagnostic non-mutant du même check Prettier : 1 198 lignes `[warn]` et 12 lignes `[error]`.
Les erreurs de parsing concernent exactement :

```text
docs/research/niveau9/perf/coldboot-after-head.json
docs/research/niveau9/perf/coldboot-before-0e55cc09.json
SyntaxError: The input should contain exactly one expression, but the first expression is
followed by the unexpected character `1`. (1:8)
```

Ces deux fichiers portent une extension JSON mais contiennent des lignes `boot 1: ...`. Le backlog
de formatage est global et préexistant. Comme `check:format` échoue, `pnpm run lint` n'est pas
exécuté par cette commande chaînée.

## RUN 3 — typecheck bloquant

COMMAND: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`

EXIT: 0

OUTPUT:

```text
@zero/server types: worker-configuration.d.ts generated
@zero/mail types: worker-configuration.d.ts generated
✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
```

TYPECHECK_BLOCKING: `server=0`, `mail=0`.

## RUN 4 — build mail

COMMAND: `pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build`

EXIT: 0

OUTPUT:

```text
✔ [paraglide-js] Compilation complete (message-modules)
Oxlint: 3 warnings, 0 errors
Client build: ✓ built in 10.89s
SSR build: ✓ built in 7.11s
```

Warnings Oxlint hérités : paramètre `values` inutilisé dans
`app/(routes)/settings/security/page.tsx`, imports `useState` et `useEffect` inutilisés dans
`components/ui/ai-sidebar.tsx`. Le build signale aussi un sourcemap non résolu, un warning CSS
`Unexpected ")"`, deux imports à la fois dynamiques et statiques, et des chunks supérieurs à
500 kB ; aucun ne fait échouer le RUN.

## RUN 5 — dry-run serveur

COMMAND: `pnpm --filter @zero/server exec wrangler deploy --dry-run --env local --outdir .architect/tmp/niveau10-server-dryrun`

EXIT: 0

OUTPUT:

```text
Total Upload: 21933.24 KiB / gzip: 2753.71 KiB
--dry-run: exiting now.
```

Aucun déploiement n'a eu lieu. Les bindings listés sont ceux de l'environnement `local`. Le
répertoire de sortie ignoré généré par le dry-run a été supprimé après inspection.

## RUN 6 — surface agent

COMMAND: `node scripts/security/check-agent-surface.mjs`

EXIT: 0

OUTPUT:

```text
Security surface check passed: least scopes, bounded session cache, draft-only MCP.
```

La preuve mécanique confirme les scopes minimaux, le cache de session borné et une surface MCP
draft-only. Aucun outil ou smoke send/delete/spam/settings n'a été exécuté.

## RUN 7 — hygiène du diff

COMMAND: `git diff --check`

EXIT: 0

OUTPUT: vide

## Frontières non exécutées

- Aucun Computer Use ni preview authentifiée : ces critères restent JUDGE-ONLY.
- Aucun consentement OAuth persistant, connexion Codex/Claude live ou cycle fournisseur.
- Aucun envoi, mutation de production ou déploiement réel.
- Aucune preuve `Sent` avant/après n'est revendiquée par cette partie mécanique.

## Verdict mécanique

Les RUNs 3 à 7 sont verts, avec `TYPECHECK_BLOCKING server=0/mail=0`, build mail complet, dry-run
sans déploiement et surface agent draft-only. La livraison mécanique n'est toutefois pas
acceptable tant que RUN 1 et RUN 2 restent rouges.

STATUS: BLOCKED
