# Check — mcp-foundation

Executor: bash

Spec: `docs/spec/niveau10-mailos.md` sections 3 et 4 jusqu'aux fondations.

## RUN

- RUN: `pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-auth.test.ts src/routes/agent/mcp-account.test.ts src/routes/agent/mcp-idempotency.test.ts src/routes/agent/mcp-tools.test.ts` -> exit 0
- RUN: `node scripts/security/check-agent-surface.mjs` -> exit 0 et surface toujours draft-only
- RUN: `pnpm --filter @zero/server exec eslint src/routes/index.ts src/lib/logger.ts src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts` -> exit 0
- RUN: `pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit` -> exit 0
- RUN: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/(src\/routes\/index\.ts|src\/lib\/logger\.ts|src\/routes\/agent\/mcp[^\/]*\.ts)|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-foundation-01\.md)$/ {print; bad=1} END {exit bad}'` -> aucune sortie ; touch-set respecté
- RUN: `git diff --check` -> exit 0

## ACCEPTANCE

1. Protected-resource metadata décrit exactement l'URL `/mcp`; chaque 401 MCP inclut
   un `WWW-Authenticate` conforme. Authorization-server metadata et PKCE restent valides.
2. Aucun bearer, cookie, corps ou secret n'est journalisé, même sur auth invalide.
3. Chaque outil résout le driver depuis `activeConnectionId` détenu par `userId` ; la
   bascule A→B affecte list/get/create et une connexion tierce est indistinguable d'absent.
4. Une session supporte 25 appels successifs sans réutiliser une DB fermée.
5. Toute mutation exige une clé ; 20 appels concurrents même connexion/clé/payload
   créent un seul effet ; payload différent retourne conflit sans effet.
6. Les schémas rejettent avant driver : email invalide ou CRLF, page hors 1..50/non
   entière, >50 destinataires, sujet >998 caractères, corps >2 Mio, query >2 048 et clé
   absente/hors 1..128.
7. Aucun outil send/approve/permanent-delete/spam/settings ni requête Gmail générique.
8. Le builder ne touche ni la spec ni les checks et ne commit/push rien.
