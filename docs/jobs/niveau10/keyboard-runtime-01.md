MIRROR: ORCHESTRATOR

pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
exit: 0
Test Files  3 passed (3)
Tests  35 passed (35)
components/mail/reply-recipients.test.ts (18 tests)
lib/hotkeys/keyboard-parity.test.ts (11 tests)
lib/hotkeys/keyboard-runtime.test.tsx (6 tests)
stderr: KeyboardLayoutMap API is not supported in this browser

pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts
exit: 0
Warning: React version not specified in eslint-plugin-react settings.
5 problems (0 errors, 5 warnings)
apps/mail/components/create/email-composer.tsx: react-hooks/exhaustive-deps (3)
apps/mail/lib/hotkeys/mail-list-hotkeys.tsx: react-hooks/exhaustive-deps (2)

pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build
exit: 1
typegen: Compilation complete (message-modules)
build: react-router build
app/root.tsx: "pages.error.boundary.oops" is not exported by "paraglide/messages/_index.js"
components/queue/queue-review.tsx: "queue.status.queued" is not exported by "paraglide/messages/_index.js"
components/mail/reply-composer.tsx: "states.sending" is not exported by "paraglide/messages/_index.js"
Build failed in 5.76s
[react-router] (void 0) is not a function
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @zero/mail@0.1.0 build: `react-router build`

git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'
exit: 0
output: 

git diff --check
exit: 0
output: 

STATUS: BLOCKED (frozen typegen+build command exits 1 during React Router prerender with Paraglide message exports missing and `(void 0) is not a function`; ran it once after successful typegen, then completed the remaining frozen touch-set and diff checks.)
