# Frozen checks — perf / p1-local-first-cache

Executor: bash
Spec pointer: docs/spec/perf-baseline.md (+ classement B1)
Run: perf · Slice: p1-local-first-cache
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baseline au gel : tsc mail = 99 erreurs. Aucune persistance tanstack-query
(grep persistQueryClient = 0 au gel).

## Runnable checks

- RUN: `grep -rc "createAsyncStoragePersister\|createSyncStoragePersister\|experimental_createQueryPersister\|PersistQueryClientProvider\|persistQueryClient" apps/mail/providers apps/mail/lib 2>/dev/null | grep -v ":0" | wc -l` -> expected output >= 1 (persister branché au query client)
- RUN: `grep -rci "indexeddb\|idb" apps/mail/lib apps/mail/providers 2>/dev/null | grep -v ":0" | wc -l` -> expected output >= 1 (stockage IndexedDB, pas localStorage)
- RUN: `grep -rn "idb-keyval\|\"idb\"" apps/mail/package.json | wc -l` -> expected output >= 1 (dépendance idb présente) OR grep dexie accepted — judge validates the actual lib
- RUN: `cd apps/mail && npx vitest run --reporter=basic 2>&1 | tail -5` -> expected: exit 0, aucun test en échec (suite existante + éventuels nouveaux tests)
- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 99 && echo TSC_NO_NEW_ERRORS` -> expected output `TSC_NO_NEW_ERRORS`
- RUN: `git status --porcelain -- apps/server packages | wc -l` -> expected output `0`

## Judge-only checks (orchestrator-graded)

- Les queries de threads/listes de mail sont persistées (buster de version
  présent pour invalider proprement au déploiement).
- Données sensibles : la persistance reste locale au navigateur (IndexedDB),
  pas de sync externe ; les mutations ne sont PAS persistées, seulement le
  cache de lecture.
- Un fil déjà consulté s'ouvre depuis le cache après reload (pattern
  hydrate-then-revalidate), vérifiable en lecture du code du provider.
- maxAge/gcTime raisonnables (heures/jours, pas infini sans buster).
