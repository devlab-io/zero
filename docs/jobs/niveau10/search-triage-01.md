MIRROR: ORCHESTRATOR

## PHASE 0

- Le check gelé, la section recherche/triage de la spec, les rulings, le FAIL du juge 1 et le
  rapport builder précédent ont été lus intégralement.
- Le correctif reste dans le touch-set autorisé. La spec et le check ne sont pas modifiés ; aucun
  raccourci, binder, outil agent ou surface MCP ne change.
- Les acquis du checkpoint sont conservés : `/` passe par `GlobalHotkeys`, Enter reste lexical,
  l'IA exige une sélection explicite, les résultats utilisent `sender` et la route inbox exacte,
  le test chaud p75 couvre 20 vrais `KeyboardEvent`, le toast important reste couplé à la mutation
  réelle, et les cibles header restent nommées et dimensionnées.

## Correction du FAIL juge 1

- `clearAllFilters` appelle désormais les vrais setters URL de `labels` et `category`, en plus de
  vider la recherche lexicale, `activeFilters` et son stockage local. Le test monte le vrai hook
  `useSearchLabels` sur un store query-state et observe les deux écritures `null`.
- L'état vide de la liste considère désormais recherche, labels, catégorie et filtres actifs. Une
  recherche label-only sans résultat rend donc « No messages match these filters » et non l'état
  de boîte vide.
- `runThreadRemovalNavigation` calcule le fil cible par identité sur la liste immuable, exécute
  ensuite la mutation, puis restaure `threadId` et `focusedIndex` après tout clear interne.
- Ce seam est consommé directement par les clics archive du reader et des lignes, ainsi que par
  les hotkeys archive suivant/précédent, snooze et delete. L'ancien command post-mutation basé sur
  l'index a été retiré.
- Les tests 1/2/20 exécutent ce seam de production pour clic archive, hotkey archive et hotkey
  snooze ; leur mutation de test efface réellement URL/focus avant restauration. Le cas
  archive-previous vérifie aussi l'identité et l'index décalé.

## RUN 1

`pnpm --filter @zero/mail exec vitest run components/context/command-palette-context.test.tsx components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx`

exit: 0

```text
 RUN  v3.2.7 .../apps/mail

stderr | components/mail/thread-triage.test.tsx
KeyboardLayoutMap API is not supported in this browser

stderr | components/context/command-palette-search.test.tsx
KeyboardLayoutMap API is not supported in this browser

 ✓ components/context/command-palette-search.test.tsx (23 tests) 105ms
 ✓ components/context/command-palette-context.test.tsx (6 tests) 17ms
 ✓ components/mail/thread-triage.test.tsx (6 tests) 4ms

 Test Files  3 passed (3)
      Tests  35 passed (35)
   Duration  1.80s
```

## RUN 2

`pnpm --filter @zero/mail exec eslint components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx components/mail/thread-display.action-button.tsx components/mail/mail-list.tsx components/mail/mail-list-thread.tsx components/mail/mail.tsx hooks/use-labels-search.ts hooks/use-mail-navigation.ts lib/hotkeys/global-hotkeys.tsx lib/hotkeys/thread-display-hotkeys.tsx && pnpm exec prettier apps/mail/components/context/command-palette-context.tsx apps/mail/components/context/command-palette-dialog.tsx apps/mail/components/context/command-palette-views.tsx apps/mail/components/context/command-palette-search.test.tsx apps/mail/components/context/command-registry.ts apps/mail/components/mail/mail.tsx apps/mail/components/mail/mail-list.tsx apps/mail/components/mail/mail-list-thread.tsx apps/mail/components/mail/thread-display.tsx apps/mail/components/mail/thread-display.action-button.tsx apps/mail/components/mail/thread-display.triage.tsx apps/mail/components/mail/thread-triage.test.tsx apps/mail/hooks/use-labels-search.ts apps/mail/hooks/use-mail-navigation.ts apps/mail/lib/hotkeys/global-hotkeys.tsx apps/mail/lib/hotkeys/thread-display-hotkeys.tsx --check`

exit: 0

```text
Warning: React version not specified in eslint-plugin-react settings.

apps/mail/components/mail/mail-list-thread.tsx
  131:8  warning  React Hook useMemo has a missing dependency
  432:6  warning  React Hook useMemo has missing dependencies

apps/mail/components/mail/mail-list.tsx
  116:7  warning  React Hook useCallback has a missing dependency
  143:8  warning  React Hook useEffect has a missing dependency
  185:7  warning  React Hook useCallback has a missing dependency

apps/mail/components/mail/mail.tsx
  349:6  warning  React Hook useEffect has a missing dependency

apps/mail/hooks/use-mail-navigation.ts
  143:5  warning  React Hook useCallback has a missing dependency
  274:5  warning  React Hook useCallback has an unnecessary dependency

8 problems (0 errors, 8 warnings)

Checking formatting...
All matched files use Prettier code style!
```

## RUN 3

`pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`

exit: 0

```text
> @zero/server@ types
> wrangler types --env local
Generating project types...
Generating runtime types...
Runtime types generated.
Types written to worker-configuration.d.ts

> @zero/mail@0.1.0 types
> wrangler types
Generating project types...
Generating runtime types...
Runtime types generated.
Types written to worker-configuration.d.ts

Found 3 warnings and 0 errors.
Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
```

## RUN 4

`git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(components\/context\/(command-palette-context\.tsx|command-palette-dialog\.tsx|command-palette-views\.tsx|command-palette-search\.test\.tsx|command-registry\.ts)|components\/mail\/(mail\.tsx|mail-list\.tsx|mail-list-thread\.tsx|thread-display(\.[^.]+)?\.tsx|thread-triage\.test\.tsx)|hooks\/(use-labels-search|use-mail-navigation)\.ts|lib\/hotkeys\/(global-hotkeys|thread-display-hotkeys)\.tsx)|docs\/jobs\/niveau10\/search-triage-01\.md)$/ {print; bad=1} END {exit bad}'`

exit: 0

```text
[no output]
```

## RUN 5

`git diff --check`

exit: 0

```text
[no output]
```

STATUS: COMPLETE — 5/5 RUNs gelés passent ; aucun commit ni push effectué.
