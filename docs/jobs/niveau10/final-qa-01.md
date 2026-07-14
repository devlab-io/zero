# Final QA mécanique — Correction 2

MIRROR: BUILDER final-qa-01 correction-2

BASELINE / FREEZE: `c9fdc91f0c516d58910b00c722d84d46b1c93069`

CHECK: `docs/checks/niveau10/final-qa.md` — ratchet format/lint corrigé

RULINGS: `docs/jobs/niveau10/final-qa-rulings.md` — fixture Gmail et ratchet du diff Niveau 10

SCOPE: correction test-only du fixture Gmail, formatage mécanique des dix fichiers autorisés du
diff Niveau 10, mise à jour du rapport ; aucun changement driver, spec, check ou ruling ; aucun
Computer Use, OAuth, envoi, déploiement réel, commit ou push

## Correction 2

- La réponse fixture `users.drafts.get` dans `google-drafts.test.ts` fournit maintenant
  `message.threadId`, construit comme `thr-${p.id}`. Le driver et son comportement fournisseur
  restent inchangés.
- Le ratchet initial a signalé exactement dix fichiers du diff Niveau 10. `pnpm exec prettier
--write` a été appliqué uniquement à ces chemins :
  - `apps/mail/app/(routes)/settings/shortcuts/contextual-shortcut-sheet.tsx`
  - `apps/mail/components/mail/reply-recipients.test.ts`
  - `apps/mail/components/mail/reply-recipients.ts`
  - `apps/mail/lib/hotkeys/use-hotkey-utils.ts`
  - `apps/server/src/lib/driver/google-drafts.test.ts`
  - `apps/server/src/routes/agent/mcp-account.test.ts`
  - `apps/server/src/routes/agent/mcp-account.ts`
  - `apps/server/src/routes/agent/mcp-auth.test.ts`
  - `apps/server/src/routes/agent/mcp-idempotency.test.ts`
  - `apps/server/src/routes/index.ts`
- Aucun fichier historique hors diff n'a été formaté.

## Correction 3 — hook de commit

- Le hook Oxlint a détecté `gmailError`, importé mais jamais utilisé dans le fixture Gmail.
- L'import mort a été retiré sans modifier le comportement du test ni le driver.
- Le hook n'a pas été contourné ; la gate déterministe complète a été rejouée après cette correction.

## RUNs corrigés — ordre gelé

### RUN 1 — suite complète

COMMAND: `pnpm test`

EXIT: 0

OUTPUT:

```text
@zero/server:test: Test Files  27 passed (27)
@zero/server:test: Tests       324 passed (324)
@zero/mail:test:   Test Files  28 passed (28)
@zero/mail:test:   Tests       196 passed (196)
Tasks: 2 successful, 2 total
```

TOTAL: 55 fichiers de test, 520/520 tests. Le scénario Gmail Drafts précédemment rouge passe.
Les messages `KeyboardLayoutMap API is not supported in this browser` et les logs du scénario de
retry `use-optimistic-actions` restent du bruit de test attendu, sans échec.

### RUN 2 — ratchet format/lint

COMMAND: `git diff --name-only --diff-filter=ACMR bc3dab47...HEAD -- apps/mail apps/server docs/agent scripts/security | rg '\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|html|yml|yaml)$' | tr '\n' '\0' | xargs -0 pnpm exec prettier --check && pnpm --filter @zero/server exec eslint src/routes/index.ts src/lib/logger.ts src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/context/command-palette-search.test.tsx components/mail components/queue components/create/email-composer.tsx components/create/email-composer.fields.tsx components/create/create-email.tsx hooks/use-composer-draft-persistence.ts hooks/use-labels-search.ts hooks/use-mail-navigation.ts app/root.tsx app/'(routes)'/settings/shortcuts`

EXIT: 0

OUTPUT:

```text
Checking formatting...
All matched files use Prettier code style!
✖ 24 problems (0 errors, 24 warnings)
```

Les 24 warnings sont des `react-hooks/exhaustive-deps` hérités sur onze fichiers mail certifiés.
Les deux invocations ESLint signalent aussi que la version React n'est pas configurée ; aucune
erreur lint n'est produite.

### RUN 3 — typecheck bloquant

COMMAND: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`

EXIT: 0

OUTPUT:

```text
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
```

TYPECHECK_BLOCKING: `server=0`, `mail=0`.

### RUN 4 — build mail

COMMAND: `pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build`

EXIT: 0

OUTPUT:

```text
✔ [paraglide-js] Compilation complete (message-modules)
Oxlint: 3 warnings, 0 errors
Client build: ✓ built in 10.61s
SSR build: ✓ built in 6.61s
```

Les trois warnings Oxlint hérités concernent le paramètre `values` inutilisé dans la page
sécurité et les imports `useState` / `useEffect` inutilisés dans `ai-sidebar.tsx`. Les warnings
sourcemap, CSS, imports dynamiques/statiques et taille des chunks restent non bloquants.

### RUN 5 — dry-run serveur

COMMAND: `pnpm --filter @zero/server exec wrangler deploy --dry-run --env local --outdir .architect/tmp/niveau10-server-dryrun`

EXIT: 0

OUTPUT:

```text
Total Upload: 21933.42 KiB / gzip: 2753.74 KiB
--dry-run: exiting now.
```

Aucun déploiement n'a eu lieu. Le répertoire de sortie ignoré a été inspecté puis supprimé.

### RUN 6 — surface agent

COMMAND: `node scripts/security/check-agent-surface.mjs`

EXIT: 0

OUTPUT:

```text
Security surface check passed: least scopes, bounded session cache, draft-only MCP.
```

### RUN 7 — hygiène du diff

COMMAND: `git diff --check`

EXIT: 0

OUTPUT: vide

## Frontières conservées

- Aucun Computer Use ou preview authentifiée : ces critères restent JUDGE-ONLY.
- Aucun consentement OAuth persistant ou connexion Codex/Claude live.
- Aucun envoi, mutation de production ou déploiement réel.
- Le ruling CAS fail-closed reste inchangé.

STATUS: COMPLETE

---

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
