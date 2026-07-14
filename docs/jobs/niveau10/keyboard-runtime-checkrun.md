# Checkrun: keyboard-runtime-v8-checkrun
generated: 2026-07-14T13:17:46Z  runner: sh  config: .architect/checkrun-keyboard-runtime-v8.json
check_file: docs/checks/niveau10/keyboard-runtime.md  freeze_sha: a778c06be0d3715e7ad82e3102130bde14f769e1
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=13e3183706f30cca0247f0a66b63dfdfbc772dc8
changed_files: 2 listed below; docs_checks_touched=false
apps/mail/lib/hotkeys/keyboard-runtime.test.tsx
docs/jobs/niveau10/keyboard-runtime-01.md

## RUN line 9
$ pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
exit: 0  ms: 2638  bytes: 773

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail

 ✓ components/mail/reply-recipients.test.ts (18 tests) 3ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-parity.test.ts (11 tests) 7ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser

 ✓ lib/hotkeys/keyboard-runtime.test.tsx (8 tests) 1402ms
   ✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+?  1392ms

 Test Files  3 passed (3)
      Tests  37 passed (37)
   Start at  03:17:46
   Duration  2.03s (transform 575ms, setup 0ms, collect 278ms, tests 1.41s, environment 696ms, prepare 148ms)


## RUN line 10
$ pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts
exit: 0  ms: 1593  bytes: 1478
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/components/create/email-composer.tsx
  217:9  warning  The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 539) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook  react-hooks/exhaustive-deps
  396:9  warning  The 'saveDraft' function makes the dependencies of useEffect Hook (at line 520) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook                react-hooks/exhaustive-deps
  458:9  warning  The 'handleClose' function makes the dependencies of useEffect Hook (at line 479) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook            react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail/lib/hotkeys/mail-list-hotkeys.tsx
   85:6  warning  React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array  react-hooks/exhaustive-deps
  197:6  warning  React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

✖ 5 problems (0 errors, 5 warnings)


## RUN line 11
$ pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build
exit: 0  ms: 24767  bytes: 38147 truncated
(node:27067) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '_'.[0m
    ╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
 [2m34[0m │
 [2m35[0m │   function onSubmit(values: z.infer<typeof formSchema>) {
    · [38;2;246;87;248m                    ───┬──[0m
    ·                        [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
 [2m36[0m │     setIsSaving(true);
    ╰────
[38;2;106;159;181m  help: [0mConsider removing this parameter.

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

Found 3 warnings and 0 errors.
Finished in 22ms on 358 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
components/mail/mail-list-thread.tsx(232,44): error TS2769: No overload matches this call.
  Overload 1 of 3, '(input: typeof skipToken | { id: string; }, opts: DefinedTRPCQueryOptionsIn<{ messages: { id: string; title: string; subject: string; tags: { name: string; id: string; type: string; }[]; sender: { email: string; name?: string | undefined; }; ... 19 more ...; isDraft?: boolean | undefined; }[]; hasUnread: boolean; totalReplies: number; labels: { ...; }[]; latest?: { ...; } | undefined; }, { ...; }, TRPCClientErrorLike<...>>): DefinedTRPCQueryOptionsOut<...>', gave the following error.
    Type 'string | undefined' is not assignable to type 'string'.
      Type 'undefined' is not assignable to type 'string'.
  Overload 2 of 3, '(input: { id: string; }, opts?: UnusedSkipTokenTRPCQueryOptionsIn<{ messages: { id: string; title: string; subject: string; tags: { name: string; id: string; type: string; }[]; sender: { email: string; name?: string | undefined; }; to: { email: string; name?: string | undefined; }[]; ... 18 more ...; isDraft?: boolean | undefined; }[]; hasUnread: boolean; totalReplies: number; labels: { ...; }[]; latest?: { ...; } | undefined; }, { ...; }, TRPCClientErrorLike<...>> | undefined): UnusedSkipTokenTRPCQueryOptionsOut<...>', gave the following error.
    Type 'string | undefined' is not assignable to type 'string'.
      Type 'undefined' is not assignable to type 'string'.
  Overload 3 of 3, '(input: typeof skipToken | { id: string; }, opts?: UndefinedTRPCQueryOptionsIn<{ messages: { id: string; title: string; subject: string; tags: { name: string; id: string; type: string; }[]; sender: { email: string; name?: string | undefined; }; ... 19 more ...; isDraft?: boolean | undefined; }[]; hasUnread: boolean; totalReplies: number; labels: { ...; }[]; latest?: { ...; } | undefined; }, { ...; }, TRPCClientErrorLike<...>> | undefined): UndefinedTRPCQueryOptionsOut<...>', gave the following error.
    Type 'string | undefined' is not assignable to type 'string'.
      Type 'undefined' is not assignable to type 'string'.
undefined
/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: tsc --noEmit --pretty false

> @zero/mail@0.1.0 build /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-02/apps/mail
> react-router build

✔ [paraglide-js] Compilation complete (message-modules)
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
(node:27591) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

  [38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '_'.[0m
    ╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
 [2m34[0m │
 [2m35[0m │   function onSubmit(values: z.infer<typeof formSchema>) {
    · [38;2;246;87;248m                    ───┬──[0m
    ·                        [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
 [2m36[0m │     setIsSaving(true);
    ╰────
[38;2;106;159;181m  help: [0mConsider removing this parameter.

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

Found 3 warnings and 0 errors.
Finished in 11ms on 358 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
transforming...
(node:27640) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
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


## RUN line 12
$ git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'
exit: 0  ms: 33  bytes: 0

## RUN line 13
$ git diff --check
exit: 0  ms: 13  bytes: 0
