# Architect judge: UX trust — loop 1

Checks integrity: PASS

Raw evidence:

```text
freeze_sha=9cdf39b0417a034a07b0d09053f3b9f70c63f718
current_head=95a741864fa5bc3f00e078939492e9a601420213
checkrun_integrity=check_file_matches_freeze=true
docs_checks_touched=false
changed_files=25

git diff 9cdf39b0417a034a07b0d09053f3b9f70c63f718..HEAD -- docs/checks/
<no output>

git status --porcelain --untracked-files=all
?? docs/jobs/niveau10/ux-trust-01.md
```

The checkrun records the exact requested implementation HEAD and the frozen check is intact. The
only untracked worktree file is the authorized builder report. The 25 tracked changes are all in
the frozen mail UX touch-set; there is no server hot-path, spec, check, registry, or binder change.

Diff vs intent: FAIL

Most of the slice is aligned with the frozen UX intent: finite list/thread/body errors and retries,
stable skeletons, responsive safe-area composer layout, focus-visible inbox actions with 44/40 px
targets, canonical queue binding, per-item pending state, mobile queue actions, details-hidden IDs,
tabular counters, reduced motion, and preserved Geist assets are all present in the production
paths. The autosave implementation, however, can truthfully persist only the *older* snapshot on
the server while announcing that the *newer* visible content is saved to the server. That directly
violates acceptance item 3 and is decisive.

## Findings

### [P1] An older autosave response can mark newer edits as saved — FAIL

`apps/mail/components/create/email-composer.tsx:415-467` captures the current form/editor values,
starts `createDraft`, and unconditionally runs `setHasUnsavedChanges(false)` plus
`SAVE_SUCCEEDED` when that request resolves. There is no snapshot signature, monotonically
increasing revision, request identity, or post-response comparison with the current composer.

Concrete production sequence:

1. Snapshot A becomes dirty and its three-second timer calls `saveDraft()`.
2. `createDraft(A)` is in flight and the UI reports `saving`.
3. The user types snapshot B. The persistence effect at lines 537-556 durably writes B locally and
   sets the dirty bit, but it does not invalidate the in-flight A request.
4. `createDraft(A)` resolves. Lines 465-466 clear the shared dirty bit and dispatch
   `SAVE_SUCCEEDED`, even though B has never reached the server.
5. Because `hasUnsavedChanges` is now false, the autosave effect at lines 564-572 schedules no
   save for B. The visible status says “Saved to server” for content that is only local.

This is not just duplicate-request polish: it creates the exact false-saved state forbidden by
`docs/checks/niveau10/ux-trust.md:23-24` and can leave the newest recipients, subject, or body
unsynced indefinitely until another edit. The focused test does not exercise the production async
path. `apps/mail/components/mail/ux-trust.test.tsx:43-51` tests only the context-free reducer and
even asserts that `SAVE_SUCCEEDED` after an error becomes `server`; it cannot detect stale/out-of-
order completion.

Required correction: version/sign each snapshot/save attempt and accept success only when it still
matches the latest snapshot (or keep the newer dirty state and schedule its save). Add a mounted or
extracted production-seam regression with a deferred first request, an edit during flight, and an
assertion that the newer edit is not reported server-saved until its own request succeeds.

## Static acceptance audit

1. **Stable loading/error/retry: PASS (static).** `mail-list.tsx:153-160,210-288` distinguishes
   loading/error/empty/stale while retaining cached rows; `thread-display.tsx:261-269,322-380`
   renders a finite retry/back error and stale retry banner; `mail-content.tsx:194-237` renders a
   body skeleton, finite error/retry, and retains processed stale content; reply lazy boundaries use
   `ReplyComposerSkeleton` instead of `null` (`thread-display.message-list.tsx:59-64`,
   `thread-display.tsx:595-605`). Real <100 ms/CLS evidence remains the root's browser gate.
2. **Composer responsive/Tab surface: PASS (static).** `create-email.tsx:220-289` supplies a
   viewport/safe-area-aware mobile shell and stable lazy/loading/error surfaces;
   `email-composer.tsx:648-708` is fluid and keeps the action bar sticky with safe-area padding.
   DOM order is To, Cc/Bcc controls/fields, optional From, Subject, body, then actions
   (`email-composer.fields.tsx:45-143`, `email-composer.tsx:665-708`). Cc/Bcc and close are
   focusable. Viewport overflow still belongs to the authenticated browser gate.
3. **Autosave truth/restoration: FAIL.** Local restoration covers recipients/subject/body at
   `email-composer.tsx:203-217,243-259`; error and retry are visible at lines 640-646 and 795-816.
   The stale in-flight success race above makes the server status untruthful and suppresses the
   next autosave.
4. **Inbox semantics/focus/touch: PASS (static).** Rows have one named focusable outer surface,
   Enter/Space activation, visible ring and a name containing read state, sender, subject and time
   (`mail-list-thread.tsx:209-226`; `mail-list-thread-projection.ts:51-56`). Hover commands reveal
   on `group-focus-within`, are pointer-inert while hidden, named, and 44/40 px
   (`mail-list-thread-actions.tsx:33-137`). No hidden quick action remains invisible after it receives
   focus. Authenticated Axe/contrast/touch behavior remains the root's browser gate.
5. **Queue semantics/pending/mobile: PASS (static).** The component consumes canonical queue rows
   through its single `useShortcuts` binding (`queue-review.tsx:274-321`), resolves wrap selection,
   moves real DOM focus, and guards child actions. `pendingItems` and `pendingItemIdsRef` isolate
   each mutation by item (`queue-review.tsx:119-121,169-185`), so a mutation on one row does not
   disable another. Rows are roving-focus named surfaces; technical IDs are inside `details`
   (`queue-review.tsx:550-629`). Desktop actions are item-local and the mobile 44 px action bar is
   sticky/safe-area-aware (`queue-review.tsx:638-705,711-787`).
6. **Polish/scope: PASS (static).** No `transition-all` was added. Added counters/dates use
   `tabular-nums`; root-level reduced-motion utilities disable animations/transitions/animated
   scrolling (`app/root.tsx:82`). The successful build emits Geist and Geist Mono assets. The
   tracked diff remains within the authorized 25-file UX surface.
7. **Authenticated browser QA: NOT RUN BY THIS JUDGE.** Per the explicit assignment, browser/CLS,
   <100 ms paint, Axe, touch, and 390/768/1440 captures are reserved for the root judge. No Computer
   Use was invoked and no browser claim is inferred from static code.

## Frozen RUN evidence

### RUN line 9 — focused UX tests: PASS

Command:

```sh
pnpm --filter @zero/mail exec vitest run components/mail/ux-trust.test.tsx components/mail/mail-list-thread.test.ts components/queue/queue-review.test.tsx
```

Source: evidence file and independent re-run at current HEAD.

```text
✓ components/mail/mail-list-thread.test.ts (6 tests)
✓ components/queue/queue-review.test.tsx (4 tests)
✓ components/mail/ux-trust.test.tsx (5 tests)
Test Files  3 passed (3)
Tests       15 passed (15)
independent re-run exit: 0
evidence-file exit: 0
```

The re-run agrees on files, counts, and result. These tests do not cover the async autosave race.

### RUN line 10 — ESLint touch-set: PASS

Command: exact frozen ESLint command from `docs/checks/niveau10/ux-trust.md:10`.

Source: evidence file.

```text
✖ 20 problems (0 errors, 20 warnings)
exit: 0
```

Three warnings identify unstable composer callbacks (`handleAttachment`, `saveDraft`,
`handleClose`); the remaining warnings are non-errors. Mechanical lint is green, but lint cannot
prove snapshot ordering.

### RUN line 11 — server/mail types and blocking typecheck report: PASS

Command: exact frozen command from `docs/checks/niveau10/ux-trust.md:11`.

Source: evidence file.

```text
Runtime types generated.
Types written to worker-configuration.d.ts
✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
exit: 0
```

### RUN line 12 — complete mail build: PASS

Command:

```sh
pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build
```

Source: evidence file.

```text
✔ [paraglide-js] Compilation complete (message-modules)
vite v6.3.5 building for production...
Found 3 warnings and 0 errors.
✓ 5560 modules transformed.
rendering chunks...
computing gzip size...
Geist and Geist Mono assets emitted.
runner output truncated after asset manifest
exit: 0
```

### RUN line 13 — touch-set: PASS

Command: exact frozen status/awk command from `docs/checks/niveau10/ux-trust.md:13`.

Source: evidence file.

```text
<no output>
exit: 0
```

### RUN line 14 — no added `transition-all`: PASS

Command:

```sh
git diff -U0 -- apps/mail | grep -E '^\+.*transition-all' && exit 1 || exit 0
```

Source: evidence file.

```text
<no output>
exit: 0
```

### RUN line 15 — diff hygiene: PASS

Command:

```sh
git diff --check
```

Source: evidence file and independent re-run.

```text
<no output>
evidence-file exit: 0
independent re-run exit: 0
```

All seven frozen RUNs are mechanically green. The slice still fails because the source-level
autosave race violates a stated behavioral acceptance criterion that the focused tests do not
exercise.

Slice verdict: FAIL

Decisive reason: an in-flight save of snapshot A can resolve after snapshot B is typed, clear B's
dirty state, suppress B's autosave, and label B “Saved to server.” That is a silent, user-visible
trust violation under frozen acceptance item 3 despite all seven mechanical RUNs exiting 0.

