# Check — final-qa

Executor: bash

Spec: `docs/spec/niveau10-mailos.md` en entier.

## RUN

- RUN: `pnpm test` -> exit 0
- RUN: `pnpm check` -> exit 0
- RUN: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs` -> server 0 et mail 0
- RUN: `pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build` -> exit 0
- RUN: `pnpm --filter @zero/server exec wrangler deploy --dry-run --env local --outdir .architect/tmp/niveau10-server-dryrun` -> exit 0 sans déploiement
- RUN: `node scripts/security/check-agent-surface.mjs` -> exit 0
- RUN: `git diff --check` -> exit 0

## JUDGE-ONLY / COMPUTER USE

1. Local preview démarrée et URL exacte ouverte avec Computer Use ; la preuve finale est
   authentifiée. Une fixture peut préparer le smoke mais ne satisfait pas ce critère.
2. Effets réels observés dans une inbox non destructive pour `/`, `c`, `r`, `a`, `f`,
   `d/e`, `b/h`, `s`, `j/k`, `x`, `g i`, `Escape`, `?`; les actions mutantes utilisent
   des fixtures/drafts dédiés et jamais la queue d'envoi. Aucune action ne fuit dans un
   input/editor/dialog hors Escape contrôlé.
3. Captures 390×844, 768×1024, 1440×900 : pas d'overflow, skeletons/erreurs/retry,
   composer et queue accessibles ; audit Axe sans violation critique.
4. Codex et Claude Code : connexion MCP puis cycle draft-only lecture → reply draft → get
   → update. OAuth persistant/consentement n'est exécuté qu'après confirmation requise ;
   si elle manque, le run s'arrête à cette frontière et ne prétend pas être livré.
5. Preuve compteur Sent avant/après : delta strictement 0. Aucun déploiement ni envoi.
6. Aucun fichier hors slice, aucun secret, artefact de navigateur ou sortie build tracké.
