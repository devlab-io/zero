MIRROR: ORCHESTRATOR

RAW EVIDENCE

`pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts`
exit: 0
Test Files  3 passed (3)
Tests  37 passed (37)
components/mail/reply-recipients.test.ts (18 tests)
lib/hotkeys/keyboard-parity.test.ts (11 tests)
lib/hotkeys/keyboard-runtime.test.tsx (8 tests)
stderr: KeyboardLayoutMap API is not supported in this browser

`pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts`
exit: 0
Warning: React version not specified in eslint-plugin-react settings.
5 problems (0 errors, 5 warnings)
apps/mail/components/create/email-composer.tsx: react-hooks/exhaustive-deps (3)
apps/mail/lib/hotkeys/mail-list-hotkeys.tsx: react-hooks/exhaustive-deps (2)

`pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build`
exit: 0
typegen: [paraglide-js] Compilation complete (message-modules)
build: react-router build
build: Found 3 warnings and 0 errors; Oxlint successfully finished.
build: ✓ built in 6.82s

`git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'`
exit: 0
output:

`git diff --check`
exit: 0
output:

STATUS: COMPLETE
