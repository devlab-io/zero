# Checkrun: routing-consolidation-01-checkrun
generated: 2026-07-13T12:04:18Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-routing-consolidation-01.json
check_file: docs/checks/niveau9/structure.md  freeze_sha: a32b5a97
Executor: bash
executor_config: bash
integrity: check_file_matches_freeze=true head=f34cfe575c7b6818bb7e95d223d21164b8861c19
changed_files: 135 listed below; docs_checks_touched=true
.github/workflows/ci.yml
apps/mail/app/(auth)/zero/login/page.tsx
apps/mail/app/(auth)/zero/signup/page.tsx
apps/mail/app/(full-width)/contributors.tsx
apps/mail/app/(routes)/settings/appearance/page.tsx
apps/mail/app/(routes)/settings/danger-zone/page.tsx
apps/mail/app/(routes)/settings/general/page.tsx
apps/mail/app/(routes)/settings/notifications/page.tsx
apps/mail/app/(routes)/settings/privacy/page.tsx
apps/mail/app/(routes)/settings/security/page.tsx
apps/mail/app/mailto-handler.ts
apps/mail/components/context/command-palette-context.tsx
apps/mail/components/create/ai-chat.tsx
apps/mail/components/create/email-composer.tsx
apps/mail/components/home/HomeContent.tsx
apps/mail/components/mail/mail-list.tsx
apps/mail/components/mail/mail.tsx
apps/mail/components/mail/render-labels.tsx
apps/mail/components/mail/select-all-checkbox.tsx
apps/mail/components/mail/thread-display.tsx
apps/mail/components/onboarding.tsx
apps/mail/components/pricing/pricing-card.tsx
apps/mail/components/queue/queue-view-model.test.ts
apps/mail/components/setup-phone.tsx
apps/mail/components/ui/ai-sidebar.tsx
apps/mail/components/ui/pricing-dialog.tsx
apps/mail/components/ui/recursive-folder.tsx
apps/mail/hooks/driver/use-delete.ts
apps/mail/hooks/use-email-aliases.ts
apps/mail/hooks/use-optimistic-actions.ts
apps/mail/lib/elevenlabs-tools.ts
apps/mail/lib/hotkeys/use-hotkey-utils.ts
apps/mail/lib/optimistic-actions-manager.ts
apps/mail/lib/utils.ts
apps/mail/lib/zod-resolver.ts
apps/mail/locales.ts
apps/mail/messages/ar.json
apps/mail/messages/ca.json
apps/mail/messages/cs.json
apps/mail/messages/de.json
apps/mail/messages/es.json
apps/mail/messages/fa.json
apps/mail/messages/hi.json
apps/mail/messages/hu.json
apps/mail/messages/ja.json
apps/mail/messages/ko.json
apps/mail/messages/lv.json
apps/mail/messages/nl.json
apps/mail/messages/pl.json
apps/mail/messages/pt.json
apps/mail/messages/ru.json
apps/mail/messages/tr.json
apps/mail/messages/vi.json
apps/mail/project.inlang/settings.json
apps/mail/providers/voice-provider.tsx
apps/mail/public/assets/attachment-icons/audio.svg
apps/mail/public/assets/attachment-icons/csv.svg
apps/mail/public/assets/attachment-icons/figma.svg
apps/mail/public/assets/attachment-icons/file.svg
apps/mail/public/assets/attachment-icons/html.svg
apps/mail/public/assets/attachment-icons/pdf.svg
apps/mail/public/assets/attachment-icons/powerpoint.svg
apps/mail/public/assets/attachment-icons/video.svg
apps/mail/public/assets/attachment-icons/word.svg
apps/mail/public/assets/attachment-icons/zip.svg
apps/mail/public/fonts/geist/Geist-Black.ttf
apps/mail/public/fonts/geist/Geist-Bold.ttf
apps/mail/public/fonts/geist/Geist-ExtraBold.ttf
apps/mail/public/fonts/geist/Geist-ExtraLight.ttf
apps/mail/public/fonts/geist/Geist-Light.ttf
apps/mail/public/fonts/geist/Geist-Medium.ttf
apps/mail/public/fonts/geist/Geist-Regular.ttf
apps/mail/public/fonts/geist/Geist-SemiBold.ttf
apps/mail/public/fonts/geist/Geist-Thin.ttf
apps/mail/public/homepage-image.png
apps/mail/public/nizzy.jpg
apps/mail/public/nizzy.webp
apps/mail/public/onboarding/coming-soon.png
apps/mail/public/onboarding/coming-soon.webp
apps/mail/public/onboarding/get-started.png
apps/mail/public/onboarding/get-started.webp
apps/mail/public/onboarding/ready.png
apps/mail/public/onboarding/ready.webp
apps/mail/public/onboarding/step1.gif
apps/mail/public/onboarding/step1.mp4
apps/mail/public/onboarding/step2.gif
apps/mail/public/onboarding/step2.mp4
apps/mail/public/onboarding/step3.gif
apps/mail/public/onboarding/step3.mp4
apps/mail/public/pricing-gradient.png
apps/mail/public/pricing-gradient.webp
apps/mail/public/purple-gradient.png
apps/mail/tsconfig.json
apps/server/src/db/durable-objects.ts
apps/server/src/lib/driver/google-account.ts
apps/server/src/lib/driver/google-drafts.ts
apps/server/src/lib/driver/google-labels.ts
apps/server/src/lib/driver/google-messages.ts
apps/server/src/lib/driver/google-parse.ts
apps/server/src/lib/driver/google-threads.ts
apps/server/src/lib/driver/google-transport.ts
apps/server/src/lib/driver/google.ts
apps/server/src/lib/trpc-logging.ts
apps/server/src/main.ts
apps/server/src/routes/chat.ts
apps/server/src/routes/index.ts
apps/server/src/trpc/routes/mail.ts
docs/adr/0002-routing-hono-vs-trpc.md
docs/adr/route-inventory-after.json
docs/adr/route-inventory-before.json
docs/checks/perf/w2a-lecture-liste.md
docs/checks/perf/w2c-chemin-critique.md
docs/checks/perf/w2d-medias.md
docs/jobs/niveau9/refactor-google-driver-01-checkrun.md
docs/jobs/niveau9/refactor-google-driver-01-rulings.md
docs/jobs/niveau9/refactor-google-driver-01.md
docs/jobs/niveau9/routing-consolidation-01-rulings.md
docs/jobs/niveau9/routing-consolidation-01.md
docs/jobs/niveau9/tsc-zero-mail-01-checkrun-v3.md
docs/jobs/niveau9/tsc-zero-mail-01-checkrun.md
docs/jobs/niveau9/tsc-zero-mail-01-rulings.md
docs/jobs/niveau9/tsc-zero-mail-01.md
docs/jobs/perf/stress-test-w2-checks.md
docs/jobs/perf/w2d-medias-01.md
docs/jobs/perf/w3-checks-drafts.md
docs/research/perf-m1.md
docs/research/plan-ux-9sur10.md
docs/spec/perf-9sur10.md
docs/spec/perf-m1.md
docs/testing.md
i18n.json
scripts/checks/loc-ratchet.mjs
scripts/checks/route-inventory.mjs
scripts/checks/type-ratchet.mjs
scripts/checks/typecheck-report.mjs

## RUN (mécanique — check-runner) line 6
$ grep -rnE "(\.\./)+server/src" apps/mail --include='*.ts' --include='*.tsx' | wc -l
exit: 0  ms: 37  bytes: 9
       5

## RUN (mécanique — check-runner) line 7
$ find apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store apps/server/src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts' ! -name '*.test.*' -exec wc -l {} + | sort -rn | head -15
exit: 0  ms: 29  bytes: 715
   64596 total
    2262 apps/server/src/routes/agent/index.ts
    1922 apps/mail/components/context/command-palette-context.tsx
    1783 apps/mail/components/icons/icons.tsx
    1736 apps/mail/components/mail/mail-display.tsx
    1332 apps/mail/components/home/HomeContent.tsx
    1293 apps/server/src/lib/driver/microsoft.ts
    1169 apps/mail/components/create/email-composer.tsx
    1096 apps/mail/components/mail/mail-list.tsx
    1062 apps/mail/components/mail/thread-display.tsx
    1040 apps/mail/app/(full-width)/contributors.tsx
     873 apps/server/src/pipelines.ts
     870 apps/server/src/trpc/routes/mail.ts
     849 apps/mail/components/mail/mail.tsx
     829 apps/mail/components/mail/note-panel.tsx
