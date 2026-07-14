MIRROR: BUILDER keyboard-queue-nav-03

BASELINE: `bc41aa70c29865f92d595b7ed7390b1f9af5bdb8`

RULING: `docs/jobs/niveau10/keyboard-runtime-rulings.md` — navigation queue canonique

SCOPE: correction propriétaire registre/manifeste/tests uniquement ; `queue-review.tsx`,
présentation, spec, checks et rulings inchangés ; aucun commit/push/tracker

## PHASE 0

- Plan : ajouter les six variantes de navigation au scope `queue`, étendre son manifeste,
  prouver le chemin `KeyboardEvent` → `useShortcuts` pour chaque variante, puis auditer les
  gardes input/contenteditable/dialog et l'unicité du listener canonique.
- Disagreements : aucun. Le composant queue utilise déjà `useShortcuts` dans le scope `queue` et
  ne possède aucun listener `document.keydown` local. La tranche UX consommera les nouveaux
  handlers de focus ; cette correction ne modifie donc ni ce composant ni sa présentation.

## Correction queue navigation 3

- Le registre `queue` conserve désormais `j` et `ArrowDown` → `focusNext`, `k` et `ArrowUp` →
  `focusPrevious`, `Enter` et `Space` → `openSelected`, en plus de `d/a/r/f/h`.
- `QUEUE_HANDLED_ACTIONS` expose les cinq actions canoniques du scope queue.
- La couverture exhaustive compare les onze lignes exactes du registre queue au manifeste.
- Le test runtime monte un vrai `HotkeysProvider` avec le scope `queue`, observe exactement un
  listener `keydown` issu de `useShortcuts`, puis envoie six vrais `KeyboardEvent` bouillonnants.
  Chaque variante appelle exactement une fois le handler attendu.
- Les mêmes six événements envoyés depuis un `input`, un `contenteditable` et un descendant de
  dialog produisent zéro appel supplémentaire.
- Audit source complémentaire : aucun `document.addEventListener('keydown', …)` n'existe sous
  `components/queue`; le seul binding queue reste le `useShortcuts` déjà présent.

## Préparation du worktree

- Premier RUN tests : exit 254, `vitest` absent.
- `pnpm install --frozen-lockfile` : exit 0, lockfile inchangé.
- Premier RUN après installation : exit 1 avec 37/39 tests. La lecture source ajoutée au test
  utilisait une URL Vitest non-file ; elle a été retirée au profit de la preuve runtime du listener.
  Le test contextuel existant signalait aussi les artefacts Paraglide absents du worktree frais.
- `pnpm --filter @zero/mail exec react-router typegen` : exit 0 ; compilation Paraglide terminée.

## RUNs gelés — correction 3

COMMAND: pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts

EXIT: 0

OUTPUT:

```text
 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail

 ✓ components/mail/reply-recipients.test.ts (18 tests) 3ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-parity.test.ts (12 tests) 8ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-runtime.test.tsx (9 tests) 1389ms
   ✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+?  1375ms

 Test Files  3 passed (3)
      Tests  39 passed (39)
   Duration  1.92s
```

COMMAND: pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx components/queue/queue-review.tsx app/'(routes)'/settings/shortcuts

EXIT: 0

OUTPUT:

```text
Warning: React version not specified in eslint-plugin-react settings.
components/create/email-composer.tsx: 3 inherited react-hooks/exhaustive-deps warnings
components/queue/queue-review.tsx: 3 inherited react-hooks/exhaustive-deps warnings
lib/hotkeys/mail-list-hotkeys.tsx: 2 inherited react-hooks/exhaustive-deps warnings
✖ 8 problems (0 errors, 8 warnings)
```

COMMAND: pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).\*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build

EXIT: 0

OUTPUT:

```text
✔ [paraglide-js] Compilation complete (message-modules)
lib/server-tool.ts(21,31): error TS2558: Expected 0 type arguments, but got 1.
../server/src/types.ts(184,46): error TS2304: Cannot find name 'Env'.
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command failed with exit code 1: tsc --noEmit --pretty false

> @zero/mail@0.1.0 build
> react-router build

Found 3 inherited warnings and 0 build errors.
✓ 5537 modules transformed.
✓ built in 12.63s
✓ 982 modules transformed.
Prerender (html): /manifest.webmanifest
Prerender (html): /
Prerender (html): SPA Fallback
✓ built in 7.42s
```

The two TypeScript diagnostics are outside the owner-scoped keyboard touch-set; the exact frozen
negative `rg` gate accepts them, reports no keyboard/queue-owned diagnostic, and the complete mail
production build exits 0.

COMMAND: git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/._|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/._|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'

EXIT: 0

OUTPUT: no output.

COMMAND: git diff --check

EXIT: 0

OUTPUT: no output.

COUNTS: frozen_commands=5 frozen_passed=5 frozen_failed=0 focused_test_files=3 focused_tests=39 focused_tests_passed=39 focused_tests_failed=0 queue_variants=6 queue_variant_calls=6 queue_typing_or_modal_leaks=0 queue_keydown_listeners=1 eslint_errors=0 eslint_warnings=8 owner_scope_type_errors=0 build_errors=0 touch_set_violations=0 diff_check_errors=0

STATUS: COMPLETE

---

MIRROR: BUILDER keyboard-runtime-03

SCOPE INSPECTION:

- Product correction is limited to `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx`.
- The statement still assigns `true` to `globalThis.IS_REACT_ACT_ENVIRONMENT`; only the TypeScript view of `globalThis` is intersected with the test-global property.
- No production/runtime module changed in this correction.

COMMAND: pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
EXIT: 0
OUTPUT:

RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail

✓ components/mail/reply-recipients.test.ts (18 tests) 2ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser

✓ lib/hotkeys/keyboard-parity.test.ts (11 tests) 6ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser

✓ lib/hotkeys/keyboard-runtime.test.tsx (8 tests) 1311ms
✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+? 1302ms

Test Files 3 passed (3)
Tests 37 passed (37)
Start at 03:13:49
Duration 1.80s (transform 527ms, setup 0ms, collect 231ms, tests 1.32s, environment 639ms, prepare 140ms)

COMMAND: pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts
EXIT: 0
OUTPUT:
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/components/create/email-composer.tsx
217:9 warning The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 539) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook react-hooks/exhaustive-deps
396:9 warning The 'saveDraft' function makes the dependencies of useEffect Hook (at line 520) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook react-hooks/exhaustive-deps
458:9 warning The 'handleClose' function makes the dependencies of useEffect Hook (at line 479) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/lib/hotkeys/mail-list-hotkeys.tsx
85:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps
197:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps

✖ 5 problems (0 errors, 5 warnings)

COMMAND: pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).\*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build
EXIT: 0
OUTPUT:
(node:7992) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

⚠ eslint(no-unused-vars): Identifier 'useState' is imported but never used.
╭─[components/ui/ai-sidebar.tsx:8:10]
7 │ import { useSearchValue } from '@/hooks/use-search-value';
8 │ import { useState, useEffect, useCallback } from 'react';
· ────┬───
· ╰── 'useState' is imported here
9 │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
help: Consider removing this import.

⚠ eslint(no-unused-vars): Identifier 'useEffect' is imported but never used.
╭─[components/ui/ai-sidebar.tsx:8:20]
7 │ import { useSearchValue } from '@/hooks/use-search-value';
8 │ import { useState, useEffect, useCallback } from 'react';
· ────┬────
· ╰── 'useEffect' is imported here
9 │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
help: Consider removing this import.

⚠ eslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '\_'.
╭─[app/(routes)/settings/security/page.tsx:35:21]
34 │
35 │ function onSubmit(values: z.infer<typeof formSchema>) {
· ───┬──
· ╰── 'values' is declared here
36 │ setIsSaving(true);
╰────
help: Consider removing this parameter.

Found 3 warnings and 0 errors.
Finished in 22ms on 358 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
components/mail/mail-list-thread.tsx(232,44): error TS2769: No overload matches this call.
Overload 1 of 3, '(input: typeof skipToken | { id: string; }, opts: DefinedTRPCQueryOptionsIn<...>): DefinedTRPCQueryOptionsOut<...>', gave the following error.
Type 'string | undefined' is not assignable to type 'string'.
Type 'undefined' is not assignable to type 'string'.
Overload 2 of 3, '(input: { id: string; }, opts?: UnusedSkipTokenTRPCQueryOptionsIn<...> | undefined): UnusedSkipTokenTRPCQueryOptionsOut<...>', gave the following error.
Type 'string | undefined' is not assignable to type 'string'.
Type 'undefined' is not assignable to type 'string'.
Overload 3 of 3, '(input: typeof skipToken | { id: string; }, opts?: UndefinedTRPCQueryOptionsIn<...> | undefined): UndefinedTRPCQueryOptionsOut<...>', gave the following error.
Type 'string | undefined' is not assignable to type 'string'.
Type 'undefined' is not assignable to type 'string'.
undefined
/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail:
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command failed with exit code 1: tsc --noEmit --pretty false

> @zero/mail@0.1.0 build /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail
> react-router build

✔ [paraglide-js] Compilation complete (message-modules)
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
(node:8575) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

Found 3 warnings and 0 errors.
Finished in 10ms on 358 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
transforming...
(node:8664) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Found 3 warnings and 0 errors.
Finished in 10ms on 358 files using 18 threads.

Oxlint successfully finished.
components/ui/recipient-autosuggest.tsx (1:0): Error when using sourcemap for reporting an error: Can't resolve original location of error.
✓ 5536 modules transformed.
rendering chunks...
[esbuild css minify]
▲ [WARNING] Unexpected ")" [css-syntax-error]

computing gzip size...
[Vite emitted the complete client asset-size manifest.]
✓ built in 10.35s
vite v6.3.5 building SSR bundle for production...
✔ [paraglide-js] Compilation complete (message-modules)
transforming...
(node:9542) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
Found 3 warnings and 0 errors.
Finished in 11ms on 358 files using 18 threads.

Oxlint successfully finished.
components/ui/recipient-autosuggest.tsx (1:0): Error when using sourcemap for reporting an error: Can't resolve original location of error.
✓ 981 modules transformed.
rendering chunks...
[esbuild css minify]
▲ [WARNING] Unexpected ")" [css-syntax-error]

[Vite emitted the complete server asset-size manifest.]
✓ 10 assets cleaned from React Router server build.
✓ 1 asset moved from React Router server build to client assets.
Prerender (html): /manifest.webmanifest -> build/client/manifest.webmanifest/index.html
Prerender (html): / -> build/client/index.html
Prerender (html): SPA Fallback -> build/client/\_\_spa-fallback.html
Removing the server build in /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/build/server due to ssr:false
✓ built in 6.67s

COMMAND: git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/._|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/._|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'
EXIT: 0
OUTPUT: no output.

COMMAND: git diff --check
EXIT: 0
OUTPUT: no output.

STATUS: COMPLETE

All five corrected frozen RUNs pass. The owner-scoped TypeScript gate reports no error in the authorised keyboard touch-set, and the full production build completes. The remaining `mail-list-thread.tsx:232` diagnostic belongs to the search/triage slice and is intentionally outside this gate. The test-global correction is type-only and leaves the executed assignment unchanged.
