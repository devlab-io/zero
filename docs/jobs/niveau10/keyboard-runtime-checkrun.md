# Checkrun: keyboard-runtime-checkrun
generated: 2026-07-14T12:33:15Z  runner: sh  config: .architect/checkrun-keyboard-runtime-v6.json
check_file: docs/checks/niveau10/keyboard-runtime.md  freeze_sha: 350bf2df681314bac5a1d8bf3170ae93f4fbca6e
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=6425f16f1c1085bd75b3c585ec1939bc29433284
changed_files: 18 listed below; docs_checks_touched=false
apps/mail/app/(routes)/settings/shortcuts/contextual-shortcut-sheet.tsx
apps/mail/app/(routes)/settings/shortcuts/page.tsx
apps/mail/components/create/email-composer.tsx
apps/mail/components/mail/reply-composer.tsx
apps/mail/components/mail/reply-recipients.test.ts
apps/mail/components/mail/reply-recipients.ts
apps/mail/components/queue/queue-review.tsx
apps/mail/config/shortcuts.ts
apps/mail/lib/hotkeys/global-hotkeys.tsx
apps/mail/lib/hotkeys/handler-manifest.ts
apps/mail/lib/hotkeys/keyboard-parity.test.ts
apps/mail/lib/hotkeys/keyboard-runtime.test.tsx
apps/mail/lib/hotkeys/use-hotkey-utils.ts
apps/mail/messages/en.json
apps/mail/messages/fr.json
docs/jobs/niveau10/keyboard-runtime-01.md
docs/jobs/niveau10/keyboard-runtime-checkrun.md
docs/jobs/niveau10/keyboard-runtime-judge-1.md

## RUN line 9
$ pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
exit: 0  ms: 2253  bytes: 773

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail

 ✓ components/mail/reply-recipients.test.ts (18 tests) 2ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-parity.test.ts (11 tests) 6ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-runtime.test.tsx (8 tests) 1246ms
   ✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+?  1237ms

 Test Files  3 passed (3)
      Tests  37 passed (37)
   Start at  02:33:16
   Duration  1.71s (transform 500ms, setup 0ms, collect 216ms, tests 1.25s, environment 611ms, prepare 130ms)


## RUN line 10
$ pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts
exit: 0  ms: 1563  bytes: 1478
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/components/create/email-composer.tsx
  217:9  warning  The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 539) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook  react-hooks/exhaustive-deps
  396:9  warning  The 'saveDraft' function makes the dependencies of useEffect Hook (at line 520) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook                react-hooks/exhaustive-deps
  458:9  warning  The 'handleClose' function makes the dependencies of useEffect Hook (at line 479) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook            react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/mail-list-hotkeys.tsx
   85:6  warning  React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array  react-hooks/exhaustive-deps
  197:6  warning  React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

✖ 5 problems (0 errors, 5 warnings)


## RUN line 11
$ pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build
exit: 0  ms: 20766  bytes: 33597 truncated
✔ [paraglide-js] Compilation complete (message-modules)

> @zero/mail@0.1.0 build /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail
> react-router build

✔ [paraglide-js] Compilation complete (message-modules)
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
(node:98320) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useState' is imported but never used.[0m
   ╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:10]
 [2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
 [2m8[0m │ import { useState, useEffect, useCallback } from 'react';
   · [38;2;246;87;248m         ────┬───[0m
   ·              [38;2;246;87;248m╰── [38;2;246;87;248m'useState' is imported here[0m[0m
 [2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
   ╰────
[38;2;106;159;181m  help: [0mConsider removing this import.

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useEffect' is imported but never used.[0m
   ╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:20]
 [2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
 [2m8[0m │ import { useState, useEffect, useCallback } from 'react';
   · [38;2;246;87;248m                   ────┬────[0m
   ·                        [38;2;246;87;248m╰── [38;2;246;87;248m'useEffect' is imported here[0m[0m
 [2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
   ╰────
[38;2;106;159;181m  help: [0mConsider removing this import.

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '_'.[0m
    ╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
 [2m34[0m │
 [2m35[0m │   function onSubmit(values: z.infer<typeof formSchema>) {
    · [38;2;246;87;248m                    ───┬──[0m
    ·                        [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
 [2m36[0m │     setIsSaving(true);
    ╰────
[38;2;106;159;181m  help: [0mConsider removing this parameter.

Found 3 warnings and 0 errors.
Finished in 11ms on 358 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
transforming...
(node:98382) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useState' is imported but never used.[0m
   ╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:10]
 [2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
 [2m8[0m │ import { useState, useEffect, useCallback } from 'react';
   · [38;2;246;87;248m         ────┬───[0m
   ·              [38;2;246;87;248m╰── [38;2;246;87;248m'useState' is imported here[0m[0m
 [2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
   ╰────
[38;2;106;159;181m  help: [0mConsider removing this import.

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useEffect' is imported but never used.[0m
   ╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:20]
 [2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
 [2m8[0m │ import { useState, useEffect, useCallback } from 'react';
   · [38;2;246;87;248m                   ────┬────[0m
   ·                        [38;2;246;87;248m╰── [38;2;246;87;248m'useEffect' is imported here[0m[0m
 [2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
   ╰────
[38;2;106;159;181m  help: [0mConsider removing this import.

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '_'.[0m
    ╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
 [2m34[0m │
 [2m35[0m │   function onSubmit(values: z.infer<typeof formSchema>) {
    · [38;2;246;87;248m                    ───┬──[0m
    ·                        [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
 [2m36[0m │     setIsSaving(true);
    ╰────
[38;2;106;159;181m  help: [0mConsider removing this parameter.


## RUN line 12
$ git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'
exit: 0  ms: 28  bytes: 0

## RUN line 13
$ git diff --check
exit: 0  ms: 13  bytes: 0
