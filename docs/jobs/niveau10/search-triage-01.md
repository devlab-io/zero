MIRROR: ORCHESTRATOR

`pnpm --filter @zero/mail exec vitest run components/context/command-palette-context.test.tsx components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx`

exit: 0

```
Test Files  3 passed (3)
Tests  10 passed (10)
components/context/command-palette-context.test.tsx (6 tests) 20ms
components/context/command-palette-search.test.tsx (1 test) 12ms
components/mail/thread-triage.test.tsx (3 tests) 1ms
stderr: KeyboardLayoutMap API is not supported in this browser
```

`pnpm --filter @zero/mail exec eslint components/context components/mail/mail-list.tsx components/mail/thread-display.tsx components/mail/mail-list-thread.tsx lib/hotkeys/global-hotkeys.tsx`

exit: 1

```
46 problems (35 errors, 11 warnings)
Existing named errors include command-palette-context.test.tsx (7), command-palette-dialog.tsx (2), command-palette-views.tsx (12), thread-display.tsx (2). Added command-palette-search.test.tsx reports 8 no-explicit-any errors.
```

`pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`

exit: 1

```
server: 0 errors (baseline 0)
mail: 1 errors (baseline 0)
typecheck-report FAILED (blocking): error count grew above baseline.
```

`pnpm --filter @zero/mail exec tsc --noEmit`

exit: 1

```
lib/hotkeys/keyboard-runtime.test.tsx(33,12): error TS7017
```

`git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(components\/context\/.*|components\/mail\/(mail-list\.tsx|thread-display(\.[^.]+)?\.tsx|thread-display\.tsx|mail-list-thread(\.test)?\.tsx)|lib\/hotkeys\/global-hotkeys\.tsx)|docs\/jobs\/niveau10\/search-triage-01\.md)$/ {print; bad=1} END {exit bad}'`

exit: 1

```
apps/mail/components/mail/thread-triage.test.tsx
```

`git diff --check`

exit: 0

```
```

STATUS: BLOCKED (frozen Vitest requires missing apps/mail/components/mail/thread-triage.test.tsx while frozen touch-set forbids that path; blocking typecheck additionally has forbidden lib/hotkeys/keyboard-runtime.test.tsx(33,12) TS7017; attempted required test creation, allowed mail-list-thread type fix, and all frozen commands).
