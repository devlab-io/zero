# Checkrun: w2b-robustness-01-checkrun
generated: 2026-07-13T19:27:22Z  runner: sh  config: /Users/thomasverdenne/cc/zero/.architect/checkrun-w2b-01.json
check_file: docs/checks/niveau8/robustness.md  freeze_sha: 5331ac6a7aa916b7ff1f68edb72dc57226a2def2
executor_config: bash
integrity: check_file_matches_freeze=true head=faffcc13efa23f7692203ac5dcf061ee5af669e1
changed_files: 31 listed below; docs_checks_touched=false
apps/mail/app/page.tsx
apps/mail/components/create/email-composer.tsx
apps/mail/components/mail/mail-list.tsx
apps/mail/components/mail/reply-composer.tsx
apps/mail/components/mail/thread-display.tsx
apps/mail/components/ui/app-sidebar.tsx
apps/mail/hooks/use-attachments.ts
apps/mail/hooks/use-composer-draft-persistence.ts
apps/mail/hooks/use-drafts.ts
apps/mail/hooks/use-online-status.ts
apps/mail/hooks/use-optimistic-actions.ts
apps/mail/hooks/use-settings.ts
apps/mail/hooks/use-threads.ts
apps/mail/lib/composer-flush.test.ts
apps/mail/lib/composer-flush.ts
apps/mail/lib/draft-storage.test.ts
apps/mail/lib/draft-storage.ts
apps/mail/lib/mail-list-state.test.ts
apps/mail/lib/mail-list-state.ts
apps/mail/lib/optimistic-recovery.test.ts
apps/mail/lib/optimistic-recovery.ts
apps/mail/lib/query-retry.test.ts
apps/mail/lib/query-retry.ts
apps/mail/lib/thread-view-state.test.ts
apps/mail/lib/thread-view-state.ts
apps/mail/messages/en.json
apps/mail/messages/fr.json
apps/mail/providers/query-provider.tsx
apps/mail/scripts/soak-robustness.ts
apps/mail/vitest.soak.config.ts
docs/jobs/niveau9/w2b-robustness-01.md
