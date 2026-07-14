Checks integrity: PASS
Raw evidence:
```text
$ git diff a778c06be0d3715e7ad82e3102130bde14f769e1..HEAD -- docs/checks/
exit: 0
stdout/stderr: empty
```

Diff vs intent: PASS
Raw evidence:

- The ruling limits this correction to the keyboard-owned `TS7017` test-global error and preserves the owner-scoped TypeScript gate (`docs/jobs/niveau10/keyboard-runtime-rulings.md:48-58`).
- The only product delta casts the TypeScript view of `globalThis` while preserving the runtime assignment (`apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:33-34`), satisfying the frozen scoped type/build command (`docs/checks/niveau10/keyboard-runtime.md:11`).
- The canonical registry, real-event dispatcher, contextual localized help, recipient derivation, and queue registry integration remain consistent with the frozen acceptance contract (`docs/checks/niveau10/keyboard-runtime.md:17-31`; `docs/spec/niveau10-mailos.md:86-101`).
- Final tree audit:
```text
$ git status --porcelain=v1 && git diff --exit-code && git rev-parse HEAD
b237ee585d9e942652d96df1807e43d6e70dcd8f
exit: 0
```

Per check:

- RUN line 9: PASS
  Command: `pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts`
  Source: evidence-file
  Raw evidence:
```text
exit: 0  ms: 2638  bytes: 773
 Test Files  3 passed (3)
      Tests  37 passed (37)
```

- RUN line 10: PASS
  Command: `pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts`
  Source: evidence-file
  Raw evidence:
```text
exit: 0  ms: 1593  bytes: 1478
✖ 5 problems (0 errors, 5 warnings)
```

- RUN line 11: PASS
  Command: `pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build`
  Source: evidence-file
  Raw evidence:
```text
exit: 0  ms: 24767  bytes: 38147 truncated
components/mail/mail-list-thread.tsx(232,44): error TS2769: No overload matches this call.
```
  The reported diagnostic is outside the frozen keyboard touch-set regex; the scoped rejection and full build therefore completed with overall exit 0 as required.

- RUN line 12: PASS
  Command: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'`
  Source: evidence-file
  Raw evidence:
```text
exit: 0  ms: 33  bytes: 0
stdout/stderr: empty
```

- RUN line 13: PASS
  Command: `git diff --check`
  Source: re-run
  Raw evidence:
```text
stdout/stderr:

exit_code=0
```
  Re-run and evidence-file stdout/stderr were both exactly empty, with exit code 0.

Slice verdict: PASS
Decisive reason: The frozen check remains intact, the evidence is current and valid, the type-only correction removes the keyboard-owned TypeScript defect without changing runtime behavior, and all five frozen RUNs pass.
