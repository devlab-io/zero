- Checks integrity: PASS
  Raw evidence: `git diff 350bf2df681314bac5a1d8bf3170ae93f4fbca6e..HEAD -- docs/checks/`
  ```text
  exit: 0
  stdout/stderr: empty
  ```

- Diff vs intent: PASS
  Raw evidence: The canonical registry declares `archivePrevious` as a non-ignored `thread-display` action ([shortcuts.ts](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/config/shortcuts.ts:210), [shortcuts.ts](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/config/shortcuts.ts:217)). The sheet maps it explicitly and throws for unknown actions ([contextual-shortcut-sheet.tsx](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/app/(routes)/settings/shortcuts/contextual-shortcut-sheet.tsx:11), [contextual-shortcut-sheet.tsx](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/app/(routes)/settings/shortcuts/contextual-shortcut-sheet.tsx:64)). EN and FR values exist ([en.json](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/messages/en.json:701), [fr.json](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/messages/fr.json:701)).

  Independent AST inventory: 79 registry rows, 55 unique actions, 46 non-ignored actions, 55 same-key mappings; missing mapping/EN/FR and raw-ID values were all `NONE`. The regression derives scopes/actions from `keyboardShortcuts`, includes every scope, and checks both catalogs ([keyboard-runtime.test.tsx](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:21), [keyboard-runtime.test.tsx](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:240)).

  The real event path and in-place sheet are wired through `GlobalHotkeys` ([global-hotkeys.tsx](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/global-hotkeys.tsx:22), [global-hotkeys.tsx](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/global-hotkeys.tsx:44)). Typing/dialog exclusion and AltGr handling are explicit ([use-hotkey-utils.ts](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/use-hotkey-utils.ts:278), [use-hotkey-utils.ts](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/use-hotkey-utils.ts:292)). Reply identity and case-insensitive deduplication are covered ([reply-recipients.test.ts](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/components/mail/reply-recipients.test.ts:87)).

- Per check:
  - RUN line 9: PASS
    Command: `pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0
    Test Files  3 passed (3)
         Tests  37 passed (37)
    ```

  - RUN line 10: PASS
    Command: `pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0
    ✖ 5 problems (0 errors, 5 warnings)
    ```

  - RUN line 11: PASS
    Command: `pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0  ms: 19854  bytes: 33761 truncated
    ✔ [paraglide-js] Compilation complete (message-modules)
    Found 3 warnings and 0 errors.
    Oxlint successfully finished.
    ```

  - RUN line 12: PASS
    Command: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'`
    Executor: bash
    Source: evidence-file
    Raw evidence:
    ```text
    exit: 0  ms: 29  bytes: 0
    ```

  - RUN line 13: PASS
    Command: `git diff --check`
    Executor: bash
    Source: re-run
    Raw evidence:
    ```text
    exit: 0
    stdout/stderr: empty
    ```
    This exactly matches the evidence-file result.

- Slice verdict: PASS
  Decisive reason: All five frozen RUNs pass, the check freeze is untouched, and the registry-derived exhaustive audit proves every canonical action—including `thread-display/archivePrevious`—has an explicit non-raw mapping in both catalogs while unknown actions fail loudly.

Capture Open Brain proposed but not sent: record judge 4 PASS, the 55/46-action exhaustive inventory, and the exact frozen-check evidence.