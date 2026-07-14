MIRROR: BUILDER keyboard-runtime-03

SCOPE INSPECTION:

- Product correction is limited to `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx`.
- The statement still assigns `true` to `globalThis.IS_REACT_ACT_ENVIRONMENT`; only the TypeScript view of `globalThis` is intersected with the test-global property.
- No production/runtime module changed in this correction.

COMMAND: pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
EXIT: 0
OUTPUT:

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail

 ✓ components/mail/reply-recipients.test.ts (18 tests) 2ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-parity.test.ts (11 tests) 6ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-runtime.test.tsx (8 tests) 1311ms
   ✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+?  1302ms

 Test Files  3 passed (3)
      Tests  37 passed (37)
   Start at  03:13:49
   Duration  1.80s (transform 527ms, setup 0ms, collect 231ms, tests 1.32s, environment 639ms, prepare 140ms)

COMMAND: pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts
EXIT: 0
OUTPUT:
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/components/create/email-composer.tsx
  217:9  warning  The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 539) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook  react-hooks/exhaustive-deps
  396:9  warning  The 'saveDraft' function makes the dependencies of useEffect Hook (at line 520) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook                react-hooks/exhaustive-deps
  458:9  warning  The 'handleClose' function makes the dependencies of useEffect Hook (at line 479) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook            react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/lib/hotkeys/mail-list-hotkeys.tsx
   85:6  warning  React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array  react-hooks/exhaustive-deps
  197:6  warning  React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

✖ 5 problems (0 errors, 5 warnings)

COMMAND: pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build
EXIT: 0
OUTPUT:
(node:7992) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

  ⚠ eslint(no-unused-vars): Identifier 'useState' is imported but never used.
   ╭─[components/ui/ai-sidebar.tsx:8:10]
 7 │ import { useSearchValue } from '@/hooks/use-search-value';
 8 │ import { useState, useEffect, useCallback } from 'react';
   ·          ────┬───
   ·              ╰── 'useState' is imported here
 9 │ import useSearchLabels from '@/hooks/use-labels-search';
   ╰────
  help: Consider removing this import.

  ⚠ eslint(no-unused-vars): Identifier 'useEffect' is imported but never used.
   ╭─[components/ui/ai-sidebar.tsx:8:20]
 7 │ import { useSearchValue } from '@/hooks/use-search-value';
 8 │ import { useState, useEffect, useCallback } from 'react';
   ·                    ────┬────
   ·                        ╰── 'useEffect' is imported here
 9 │ import useSearchLabels from '@/hooks/use-labels-search';
   ╰────
  help: Consider removing this import.

  ⚠ eslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '_'.
    ╭─[app/(routes)/settings/security/page.tsx:35:21]
 34 │
 35 │   function onSubmit(values: z.infer<typeof formSchema>) {
    ·                     ───┬──
    ·                        ╰── 'values' is declared here
 36 │     setIsSaving(true);
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
Prerender (html): SPA Fallback -> build/client/__spa-fallback.html
Removing the server build in /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/build/server due to ssr:false
✓ built in 6.67s

COMMAND: git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'
EXIT: 0
OUTPUT: no output.

COMMAND: git diff --check
EXIT: 0
OUTPUT: no output.

STATUS: COMPLETE

All five corrected frozen RUNs pass. The owner-scoped TypeScript gate reports no error in the authorised keyboard touch-set, and the full production build completes. The remaining `mail-list-thread.tsx:232` diagnostic belongs to the search/triage slice and is intentionally outside this gate. The test-global correction is type-only and leaves the executed assignment unchanged.
