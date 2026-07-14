# Check — mcp-draft-loop

Executor: bash

Spec: `docs/spec/niveau10-mailos.md` sections 3, 4 et critères MCP live.

## RUN

- RUN: `pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts src/routes/agent/mcp-tools.test.ts` -> exit 0
- RUN: `node scripts/security/check-agent-surface.mjs` -> exit 0 et surface draft-only
- RUN: `pnpm --filter @zero/server exec eslint src/routes/agent src/lib/driver && pnpm exec prettier docs/agent --check` -> exit 0
- RUN: `pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit` -> exit 0
- RUN: `git status --porcelain | sed 's/^...//' | awk '!/^(apps\/server\/src\/(routes\/agent\/mcp[^\/]*\.ts|lib\/driver\/.*)|docs\/agent\/.*|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-draft-loop-01\.md)$/ {print; bad=1} END {exit bad}'` -> aucune sortie ; touch-set respecté
- RUN: `git diff --check` -> exit 0

## ACCEPTANCE

1. `getThreadContext`, `createReplyDraft`, `listDrafts`, `getDraft`, `updateDraft` sont
   présents dans la source unique, le snapshot et les capabilities.
2. Le contexte passe par `sanitizeMailContent`, ≤20 messages et ≤64 Kio ; reply dérive destinataires/thread/sujet côté serveur ;
   lecture restitue le draft détenu ; update conserve son Gmail draft ID.
3. Une révision obsolète est refusée sans écrasement ; comptes et draft IDs tiers ne
   révèlent aucune existence.
4. Instructions serveur : 512 premiers caractères autonomes, draft-only et workflow
   clair. Annotations read/write/destructive/idempotent reflètent le comportement réel.
5. `composeEmail` annonce l'egress IA et le web search ; aucune donnée n'en sort sans
   appel explicite de cet outil.
6. Docs Codex et Claude Code utilisent les commandes/configs actuels, allowlistent les
   outils, exigent OAuth et approbation des writes ; Desktop pointe vers Connectors.
7. `createReplyDraft` et `updateDraft` exigent la clé 1..128 et partagent les tests de
   réservation atomique : 20 appels concurrents, conflit de payload, zéro double effet.
8. Un smoke HTTP local prouve initialize → tools/list → lecture → create reply draft →
   get → update sur fakes réalistes, et vérifie que les outils interdits sont absents.
9. Le builder adapte explicitement la whitelist de `check-agent-surface.mjs` aux deux
   nouvelles writes draft-only et ne touche ni la spec ni les checks ; aucun commit/push.
