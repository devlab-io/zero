Checks integrity: PASS  
Raw evidence:
```text
$ git diff e08ef425cfd50b1491ef5771ff86c595b7f2f63c..HEAD -- docs/checks/
exit: 0
```

Diff vs intent: FAIL  
Raw evidence:

- AZERTY `AltGr` is not handled reliably. The acceptance matrix requires QWERTY and AZERTY ([keyboard-runtime.md:19](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/docs/checks/niveau10/keyboard-runtime.md:19)), but bare punctuation rejects every event carrying `ctrlKey` ([use-hotkey-utils.ts:300](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/use-hotkey-utils.ts:300)), and sequences do likewise despite explicitly mentioning AltGr ([use-hotkey-utils.ts:355](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/use-hotkey-utils.ts:355)). The AZERTY test models `#` with only `altKey`, omitting the common `Ctrl+Alt` AltGr representation ([keyboard-runtime.test.tsx:173](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:173)).
- `Shift+?` does not satisfy contextual help. The spec requires help without leaving the inbox ([niveau10-mailos.md:96](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/docs/spec/niveau10-mailos.md:96)), while its handler navigates to `/settings/shortcuts` ([global-hotkeys.tsx:27](/Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-runtime-01/apps/mail/lib/hotkeys/global-hotkeys.tsx:27)).

Per check:

- RUN line 9: PASS  
  Command: `pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts`  
  Executor: bash  
  Source: evidence-file  
  Raw evidence:
  ```text
  exit: 0
  Test Files  3 passed (3)
       Tests  35 passed (35)
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
  exit: 0  ms: 21909  bytes: 33085 truncated
  ✔ [paraglide-js] Compilation complete (message-modules)
  Found 3 warnings and 0 errors.
  Oxlint successfully finished.
  ```

- RUN line 12: PASS  
  Command: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'`  
  Executor: bash  
  Source: evidence-file  
  Raw evidence:
  ```text
  exit: 0
  ```

- RUN line 13: PASS  
  Command: `git diff --check`  
  Executor: bash  
  Source: re-run  
  Raw evidence:
  ```text
  exit: 0
  ```
  Re-run output matched the evidence file exactly.

Slice verdict: FAIL  
Decisive reason: Although every RUN check passes, the implementation still rejects common AZERTY AltGr events and routes `?` away from the inbox instead of opening the required contextual help.