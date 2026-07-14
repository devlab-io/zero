# Frozen checks — perf / w2a-lecture-liste

Executor: bash (cwd = racine du worktree)
Spec pointer: docs/spec/perf-9sur10.md (axes 3, 4, 6) + revue docs/research/revue-perf-ux.md (W2-A) ; constats détaillés : revue-perf-data.md §A/§B, revue-perf-server.md F7/F15
Run: perf · Slice: w2a-lecture-liste
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baselines au gel (tree factory/perf, 94f05128) :
- `IGetThreadsResponse` (apps/server/src/lib/driver/types.ts:122) = `{ id, historyId, $raw? }` — aucune donnée d'affichage.
- `apps/mail/components/mail/mail-list.tsx:62` : `useThread(message.id)` par ligne (1 occurrence de `useThread(`).
- `findThreadsByFolder` (apps/server/src/routes/agent/db/index.ts:465) : SELECT sans `.limit(`.
- tsc : apps/server = 82 erreurs, apps/mail = 86 erreurs préexistantes.

## Contrat d'interface (consommé par le client et par w3b)

`listThreads` renvoie par fil, en plus de `id`/`historyId` : sujet, expéditeur
(nom + email), date de réception, snippet texte court, indicateur non-lu, et
labels/tags de la ligne — depuis le SQLite du DO (colonnes `latest_*` +
labels), sans lecture R2 ni corps. `mail.get` (fil complet) reste réservé à
l'ouverture d'un fil. Le nom exact des champs est libre mais doit s'exprimer
dans `IGetThreadsResponse`/`IGetThreadsResponseSchema` (types.ts).

## Runnable checks

- RUN: `awk '/export interface IGetThreadsResponse/,/^}/' apps/server/src/lib/driver/types.ts | grep -icE "subject|sender|receivedOn|snippet" ` -> expected: >= 3 (la projection expose les métadonnées d'affichage)
- RUN: `grep -c "useThread(" apps/mail/components/mail/mail-list.tsx || true` -> expected output `0` (les lignes de liste se rendent depuis l'infinite query, plus aucun mail.get par ligne)
- RUN: `awk '/export async function findThreadsByFolder\(/,/^}/' apps/server/src/routes/agent/db/index.ts | grep -c "\.limit("` -> expected: >= 1 (LIMIT SQL sur le chemin 1ʳᵉ page)
- RUN: `cd apps/mail && VITE_PUBLIC_BACKEND_URL="https://x.invalid" VITE_PUBLIC_APP_URL="https://x.invalid" npx react-router build > /tmp/w2a-build.log 2>&1; echo "build exit: $?"` -> expected output `build exit: 0`
- RUN: `test $(cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 82 && echo TSC_SERVER_OK` -> expected output `TSC_SERVER_OK`
- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 86 && echo TSC_MAIL_OK` -> expected output `TSC_MAIL_OK`
- RUN: `git status --porcelain -- apps/mail/public docs/checks packages | wc -l | tr -d ' '` -> expected output `0` (périmètre : ni médias, ni checks, ni packages)

## Judge-only checks (orchestrator-graded)

- En serve local, l'affichage de la liste inbox n'émet **aucun** `mail.get`
  (vérifiable par log réseau ou instrumentation temporaire du judge) ; les
  lignes affichent sujet, expéditeur, date, snippet, état non-lu et labels
  corrects — aucune régression visuelle ni fonctionnelle (étoile, sélection,
  actions de ligne intactes).
- `processEmailContent` n'est déclenché que pour le fil réellement ouvert
  (thread-display), plus jamais par les lignes de liste (`use-threads.ts`
  §email-content gaté).
- Le corps complet d'un fil n'est chargé qu'à l'ouverture ; l'ouverture d'un
  fil fonctionne (corps affiché, pièces jointes listées).
- La projection vient du SQLite du DO (pas de `R2.get` ni de parse de fil
  complet sur le chemin liste) — lecture du code serveur.
- Aucune donnée inventée : snippet/expéditeur proviennent de colonnes ou de
  données réellement synchronisées.
