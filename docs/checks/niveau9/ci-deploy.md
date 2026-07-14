# Check — CI bloquante et gate de deploy (V0.2 ci-and-deploy-gates)

Executor: bash

## RUN (mécanique — check-runner)
- RUN: `node scripts/security/check-agent-surface.mjs` -> exit 0
- RUN: `grep -c "frozen-lockfile" .github/workflows/ci.yml` -> ≥1
- RUN: `grep -rn "oxlint@latest" .github/workflows/ .husky/ package.json | wc -l` -> 0 (versions épinglées partout, y compris le script precommit racine)

1. **Contenu CI PR** (ci.yml, base = version niveau8 `quality-and-security`) : frozen install
   (`--frozen-lockfile --ignore-scripts`), génération wrangler types, typecheck (mode RAPPORT +
   ratchet non croissant en V0 ; flip bloquant = sortie de vague 1), `pnpm test` bloquant,
   lint épinglé (oxlint MÊME version que .husky, plus de `@latest`), `pnpm audit --prod
   --audit-level critical`, `node scripts/security/check-agent-surface.mjs`, scan secrets
   (gitleaks action épinglée), build mail, `wrangler deploy --dry-run` pour server ET mail,
   ratchets (`loc-ratchet`, `type-ratchet`, `console-ratchet` — scripts créés ici, bornes =
   valeurs baseline mesurées au moment du job).
2. **check-agent-surface** : le script existe sur la branche du run (porté de niveau8) et PASS.
3. **Durée** : run CI complet <15 min (preuve : run réel sur la PR de l'issue).
4. **Permissions** : `permissions: contents: read` au workflow ; aucun secret nouveau requis.
5. **Gate deploy** : `deploy-to-prod-command.yml` exige le succès du workflow CI sur le SHA
   déployé avant tout push vers main (job dependency ou vérification de check-run) ; le
   force-push sans CI verte devient impossible par construction. AUCUN deploy exécuté (hard
   stop) — la preuve est le contenu du workflow, pas son exécution.
6. **Hooks** : pre-commit exécute lint-staged réellement configuré (oxlint épinglé + prettier
   sur staged) ; preuve : commit local de test avec un fichier volontairement sale → hook rouge.
7. **Vert final** : la CI complète passe sur la branche de l'issue (lien du run dans le rapport).
