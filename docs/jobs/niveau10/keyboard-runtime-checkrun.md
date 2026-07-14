# Checkrun: keyboard-queue-nav-v13-checkrun

generated: 2026-07-14T14:52:09Z runner: sh config: .architect/checkrun-keyboard-queue-nav-v13.json
check_file: docs/checks/niveau10/keyboard-runtime.md freeze_sha: bc41aa70c29865f92d595b7ed7390b1f9af5bdb8
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=07d2ead06f780407c3d4fdcc8363f924c04f5fca
changed_files: 5 listed below; docs_checks_touched=false
apps/mail/config/shortcuts.ts
apps/mail/lib/hotkeys/handler-manifest.ts
apps/mail/lib/hotkeys/keyboard-parity.test.ts
apps/mail/lib/hotkeys/keyboard-runtime.test.tsx
docs/jobs/niveau10/keyboard-runtime-01.md

## RUN line 9

$ pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
exit: 0 ms: 2511 bytes: 775

RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail

✓ components/mail/reply-recipients.test.ts (18 tests) 2ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser

✓ lib/hotkeys/keyboard-parity.test.ts (12 tests) 7ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser

✓ lib/hotkeys/keyboard-runtime.test.tsx (9 tests) 1380ms
✓ keyboard runtime > opens localized contextual shortcut help in place from Shift+? 1366ms

Test Files 3 passed (3)
Tests 39 passed (39)
Start at 04:52:10
Duration 1.89s (transform 552ms, setup 0ms, collect 239ms, tests 1.39s, environment 599ms, prepare 119ms)

## RUN line 10

$ pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx components/queue/queue-review.tsx app/'(routes)'/settings/shortcuts
exit: 0 ms: 1641 bytes: 2352
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail/components/create/email-composer.tsx
217:9 warning The 'handleAttachment' function makes the dependencies of useEffect Hook (at line 539) change on every render. To fix this, wrap the definition of 'handleAttachment' in its own useCallback() Hook react-hooks/exhaustive-deps
396:9 warning The 'saveDraft' function makes the dependencies of useEffect Hook (at line 520) change on every render. To fix this, wrap the definition of 'saveDraft' in its own useCallback() Hook react-hooks/exhaustive-deps
458:9 warning The 'handleClose' function makes the dependencies of useEffect Hook (at line 479) change on every render. To fix this, wrap the definition of 'handleClose' in its own useCallback() Hook react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail/components/queue/queue-review.tsx
123:9 warning The 'items' logical expression could make the dependencies of useMemo Hook (at line 125) change on every render. To fix this, wrap the initialization of 'items' in its own useMemo() Hook react-hooks/exhaustive-deps
130:9 warning The 'visibleStatuses' conditional could make the dependencies of useMemo Hook (at line 133) change on every render. To fix this, wrap the initialization of 'visibleStatuses' in its own useMemo() Hook react-hooks/exhaustive-deps
251:5 warning React Hook useMemo has missing dependencies: 'approveItem', 'cancelItem', and 'openItem'. Either include them or remove the dependency array react-hooks/exhaustive-deps

/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail/lib/hotkeys/mail-list-hotkeys.tsx
85:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps
197:6 warning React Hook useCallback has a missing dependency: 'setMail'. Either include it or remove the dependency array react-hooks/exhaustive-deps

✖ 8 problems (0 errors, 8 warnings)

## RUN line 11

$ pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).\*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build
exit: 0 ms: 25016 bytes: 33971 truncated
✔ [paraglide-js] Compilation complete (message-modules)
lib/server-tool.ts(21,31): error TS2558: Expected 0 type arguments, but got 1.
../server/src/types.ts(184,46): error TS2304: Cannot find name 'Env'.
undefined
/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: tsc --noEmit --pretty false

> @zero/mail@0.1.0 build /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail
> react-router build

✔ [paraglide-js] Compilation complete (message-modules)
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
(node:39280) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useState' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:10]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬───[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useState' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useEffect' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:20]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬────[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useEffect' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '\_'.[0m
╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
[2m34[0m │
[2m35[0m │ function onSubmit(values: z.infer<typeof formSchema>) {
· [38;2;246;87;248m ───┬──[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
[2m36[0m │ setIsSaving(true);
╰────
[38;2;106;159;181m help: [0mConsider removing this parameter.

Found 3 warnings and 0 errors.
Finished in 12ms on 361 files using 18 threads.

Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
(node:39299) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Parameter 'values' is declared but never used. Unused parameters should start with a '\_'.[0m
╭─[[38;2;92;157;255;1mapp/(routes)/settings/security/page.tsx[0m:35:21]
[2m34[0m │
[2m35[0m │ function onSubmit(values: z.infer<typeof formSchema>) {
· [38;2;246;87;248m ───┬──[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'values' is declared here[0m[0m
[2m36[0m │ setIsSaving(true);
╰────
[38;2;106;159;181m help: [0mConsider removing this parameter.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useState' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:10]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬───[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useState' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

[38;2;244;191;117;1m⚠[0m [38;2;244;191;117;1meslint(no-unused-vars): Identifier 'useEffect' is imported but never used.[0m
╭─[[38;2;92;157;255;1mcomponents/ui/ai-sidebar.tsx[0m:8:20]
[2m7[0m │ import { useSearchValue } from '@/hooks/use-search-value';
[2m8[0m │ import { useState, useEffect, useCallback } from 'react';
· [38;2;246;87;248m ────┬────[0m
· [38;2;246;87;248m╰── [38;2;246;87;248m'useEffect' is imported here[0m[0m
[2m9[0m │ import useSearchLabels from '@/hooks/use-labels-search';
╰────
[38;2;106;159;181m help: [0mConsider removing this import.

Found 3 warnings and 0 errors.
Finished in 10ms on 361 files using 18 threads.

Oxlint successfully finished.
transforming...
components/ui/recipient-autosuggest.tsx (1:0): Error when using sourcemap for reporting an error: Can't resolve original location of error.
✓ 5537 modules transformed.
rendering chunks...
[esbuild css minify]
▲ [WARNING] Unexpected ")" [css-syntax-error]

    <stdin>:2:184875:
      2 │ ...ͼo.cm-content::selection:where(){background-color:var(--color-z...
        ╵                                   ^

computing gzip size...
build/client/_headers 0.10 kB
build/client/assets/geist-mono-cyrillic-wght-normal-BZdD_g9V.woff2 12.62 kB
build/client/assets/geist-mono-latin-ext-wght-normal-b6lpi8_2.woff2 13.04 kB
build/client/assets/geist-cyrillic-wght-normal-CHSlOQsW.woff2 14.69 kB
build/client/assets/geist-latin-ext-wght-normal-DMtmJ5ZE.woff2 15.31 kB
build/client/assets/geist-latin-wght-normal-Dg_dQHbK.woff2 28.40 kB
build/client/assets/geist-mono-latin-wght-normal-Cjtb1TV-.woff2 31.37 kB
build/client/.vite/manifest.json 112.24 kB │ gzip: 10.74 kB
build/client/assets/github-emojis-BZo2opiZ.json 480.05 kB │ gzip: 54.52 kB
build/client/assets/use-compose-editor-BGP8UyxO.css 1.18 kB │ gzip: 0.54 kB
build/client/assets/create-email-BPBxLlBr.css 2.85 kB │ gzip: 1.08 kB
build/client/assets/root-D2PYCvCB.css 192.97 kB │ gzip: 30.86 kB
build/client/assets/index-BdQq_4o_.js 0.06 kB │ gzip: 0.08 kB
build/client/assets/page-DjhY2S-i.js 0.09 kB │ gzip: 0.10 kB
build/client/assets/log-C2ehuyFy.js 0.12 kB │ gzip: 0.09 kB
build/client/assets/navigation_settings_categories-\_QaZskh4.js 0.14 kB │ gzip: 0.14 kB
build/client/assets/page-CRxdzZs4.js 0.14 kB │ gzip: 0.15 kB
build/client/assets/index-BOfZnf6N.js 0.14 kB │ gzip: 0.14 kB
build/client/assets/common_actions_saving-CanPWJE8.js 0.15 kB │ gzip: 0.15 kB
build/client/assets/common_actions_savechanges1-CckwYdQ3.js 0.17 kB │ gzip: 0.16 kB
build/client/assets/not-found-CnTdy4AI.js 0.21 kB │ gzip: 0.19 kB
build/client/assets/index-CqHKcKqA.js 0.23 kB │ gzip: 0.17 kB
build/client/assets/\_commonjs-dynamic-modules-TDtrdbi3.js 0.24 kB │ gzip: 0.19 kB
build/client/assets/layout-DXjLd6QY.js 0.26 kB │ gzip: 0.22 kB
build/client/assets/constants-ydyuGGyp.js 0.28 kB │ gzip: 0.24 kB
build/client/assets/common_labels_deletelabelsuccess2-sHCnk1h0.js 0.29 kB │ gzip: 0.22 kB
build/client/assets/common_settings_failedtosave2-D2JnZA2b.js 0.30 kB │ gzip: 0.23 kB
build/client/assets/check-7PyOgxMn.js 0.30 kB │ gzip: 0.25 kB
build/client/assets/chevron-down-DGR_ozeI.js 0.31 kB │ gzip: 0.25 kB
build/client/assets/chevron-right-Da6m2C-L.js 0.31 kB │ gzip: 0.25 kB
build/client/assets/moon-CBLwVqNp.js 0.33 kB │ gzip: 0.26 kB
build/client/assets/loader-circle-CFAgBoIZ.js 0.33 kB │ gzip: 0.27 kB
build/client/assets/use-do-state-CynilHAK.js 0.34 kB │ gzip: 0.20 kB
build/client/assets/plus-cpt2mBdw.js 0.34 kB │ gzip: 0.26 kB
build/client/assets/use-email-aliases-CL5PPPXw.js 0.34 kB │ gzip: 0.24 kB
build/client/assets/x-DYcxNdnZ.js 0.34 kB │ gzip: 0.26 kB
build/client/assets/arrow-left-CCA8PmXq.js 0.35 kB │ gzip: 0.27 kB
build/client/assets/arrow-right-CYTbT5jq.js 0.35 kB │ gzip: 0.27 kB
build/client/assets/clock-CUDZhQQX.js 0.36 kB │ gzip: 0.28 kB
build/client/assets/use-move-to-B-TwXSLv.js 0.36 kB │ gzip: 0.28 kB
build/client/assets/message-square-DbOijJ6-.js 0.36 kB │ gzip: 0.28 kB
build/client/assets/command-B8Adkaxa.js 0.37 kB │ gzip: 0.27 kB
build/client/assets/rotate-ccw-CxQNnslt.js 0.38 kB │ gzip: 0.29 kB
build/client/assets/info-WQs_HAcz.js 0.38 kB │ gzip: 0.29 kB
build/client/assets/skeleton-CbGm6VP9.js 0.39 kB │ gzip: 0.29 kB
build/client/assets/undo-2-DVwHmqCa.js 0.39 kB │ gzip: 0.29 kB
build/client/assets/mail-WxVkr0XE.js 0.39 kB │ gzip: 0.31 kB
build/client/assets/index-B---HDFp.js 0.40 kB │ gzip: 0.31 kB
build/client/assets/trash-DfjO8EER.js 0.42 kB │ gzip: 0.31 kB
build/client/assets/use-settings-CiGi_5We.js 0.43 kB │ gzip: 0.29 kB
build/client/assets/circle-alert-BJZItTLt.js 0.43 kB │ gzip: 0.30 kB
build/client/assets/external-link-CMjd4WD1.js 0.43 kB │ gzip: 0.31 kB
build/client/assets/common_labels_savelabelsuccess2-BTeuKkp9.js 0.44 kB │ gzip: 0.27 kB
build/client/assets/triangle-alert-D4Bwmu8Z.js 0.45 kB │ gzip: 0.32 kB
build/client/assets/users-B_MkLaRx.js 0.49 kB │ gzip: 0.33 kB
build/client/assets/page-8xSmqHo2.js 0.50 kB │ gzip: 0.34 kB
build/client/assets/tag-Da65ZYyA.js 0.51 kB │ gzip: 0.35 kB
build/client/assets/file-text-DfFGgT_S.js 0.52 kB │ gzip: 0.33 kB
build/client/assets/trash-2-D5Ofj2bH.js 0.54 kB │ gzip: 0.36 kB

## RUN line 12

$ git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/._|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/._|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'
exit: 0 ms: 48 bytes: 0

## RUN line 13

$ git diff --check
exit: 0 ms: 14 bytes: 0
