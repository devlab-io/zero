# Architect judge: UX trust — loop 2

Checks integrity: PASS

Raw evidence:

```text
freeze_sha=22a7c056ea929048789d5f924ce200b374cfbadd
current_head=01559ffc2d7a8efa7882fa4dbfaf5d6b6360cced
checkrun_integrity=check_file_matches_freeze=true
docs_checks_touched=false

working-tree correction delta:
M apps/mail/components/create/email-composer.tsx
M apps/mail/components/mail/composer-trust.ts
M apps/mail/components/mail/ux-trust.test.tsx
?? docs/jobs/niveau10/ux-trust-01.md

git diff 22a7c056ea929048789d5f924ce200b374cfbadd..HEAD -- docs/checks/
<no output>
```

The v17 runner executed the frozen commands in the correction worktree and records all seven exits
as zero. The check is unchanged, the report is the authorized untracked artifact, and the
uncommitted correction is exactly the three-file surface allowed by Ruling 2.

Diff vs intent: PASS

## Findings

No correctness finding against Ruling 2 or the frozen UX contract.

## Correction audit

1. **Every relevant edit advances a monotonic revision: PASS.**
   `apps/mail/components/create/email-composer.tsx:107-117` owns one stable
   `ComposerAutosaveRevisions` instance and synchronously increments it in `markComposerEdited`.
   React Hook Form changes are subscribed at lines 240-247, rich-body updates call the same seam at
   lines 266-270, and the explicitly excluded From field invokes it directly at lines 757-762.
   Attachments flow through form `setValue`, so they use the same subscription. `snapshotTick`
   forces the persistence/scheduler effects to observe same-length rich-text changes as well.

2. **A is captured before its first await and cannot acknowledge B: PASS.**
   `runVersionedComposerSave` captures `currentRevision` before invoking/awaiting the request at
   `apps/mail/components/mail/composer-trust.ts:97-109`. Production calls that exact seam at
   `email-composer.tsx:493-510`; recipients, subject and body are read from the A snapshot before
   the asynchronous provider call. If B is edited while A is suspended,
   `resolveSuccess(A)` compares A with the now-current revision and returns `{ effect: 'local',
dirty: true }`, never `server` (`composer-trust.ts:66-73`). Production applies that decision
   without clearing the dirty bit at `email-composer.tsx:438-455,512-526`.

3. **The second B autosave remains guaranteed: PASS.** While A is in flight, the scheduler is
   disabled. A stale completion leaves `dirty=true`/`status=local`; the `finally` block flips
   `isSavingDraft` to false at `email-composer.tsx:527-530`. Because `isSavingDraft` and
   `snapshotTick` are explicit dependencies, the effect at lines 638-654 reruns and installs B's
   three-second timer. `shouldScheduleComposerAutosave` requires exactly dirty + non-error + no
   in-flight request (`composer-trust.ts:35-41`).

4. **Provider requests are sequentialized: PASS.** The synchronous guard at
   `email-composer.tsx:457-460` rejects every overlapping entry, and the ref is set before the
   versioned request begins at lines 486-493. It is released only in `finally` at lines 527-530.
   Thus manual retry, send-triggered save and an already-armed timer cannot create concurrent
   provider draft mutations.

5. **Stale failure remains local; only the current failure becomes retryable error: PASS.**
   `ComposerAutosaveRevisions.resolveFailure` returns local/dirty for a superseded revision and
   error/dirty only for the current one at `composer-trust.ts:75-80`. Production emits the failure
   toast only for the latter and applies the returned status at `email-composer.tsx:520-526`.

6. **The regression drives the production async seam: PASS.**
   `apps/mail/components/mail/ux-trust.test.tsx:59-102` imports the same
   `runVersionedComposerSave` used by `EmailComposer`, suspends request A, marks edit B, resolves A,
   proves A yields local/dirty and B remains schedulable, then suspends B and proves it is not
   acknowledged before its own resolution. Only B's own success produces server/clean. This is an
   asynchronous A/B regression, not another reducer-only assertion.

7. **No Tab/UX/queue or scope regression: PASS (static).** The correction changes no composer DOM,
   fields, focus order, responsive classes, inbox surface, queue surface, hotkey registry or
   binder. The original 25-file UX slice remains otherwise byte-identical to the loop-1 review;
   only the autosave production seam, its pure logic seam and its focused test differ. Browser
   viewport, Axe, CLS and paint-latency verification remains explicitly root-only and was not
   attempted here.

## Frozen RUN evidence

### RUN line 9 — focused UX tests: PASS

Command:

```sh
pnpm --filter @zero/mail exec vitest run components/mail/ux-trust.test.tsx components/mail/mail-list-thread.test.ts components/queue/queue-review.test.tsx
```

Source: evidence file and independent re-run at current HEAD + correction delta.

```text
✓ components/mail/mail-list-thread.test.ts (6 tests)
✓ components/queue/queue-review.test.tsx (4 tests)
✓ components/mail/ux-trust.test.tsx (6 tests)
Test Files  3 passed (3)
Tests       16 passed (16)
evidence-file exit: 0
independent re-run exit: 0
```

### RUN line 10 — ESLint touch-set: PASS

Command: exact frozen ESLint command from `docs/checks/niveau10/ux-trust.md:10`.

Source: evidence file.

```text
20 problems (0 errors, 20 warnings)
exit: 0
```

The three composer exhaustive-deps warnings and seventeen existing touch-set warnings are
non-errors; there is no lint failure.

### RUN line 11 — Workers types and blocking typecheck report: PASS

Command: exact frozen command from `docs/checks/niveau10/ux-trust.md:11`.

Source: evidence file.

```text
Runtime types generated.
Types written to worker-configuration.d.ts
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
exit: 0
```

### RUN line 12 — production mail build: PASS

Command:

```sh
pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build
```

Source: evidence file.

```text
vite v6.3.5 building for production...
Found 3 warnings and 0 errors.
✓ 5560 modules transformed.
client and SSR builds completed; Geist assets emitted
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

All seven frozen RUNs are green. The independent focused re-run also passes 16/16 tests on the
actual uncommitted correction delta.

Slice verdict: PASS

Decisive reason: the production autosave now versions every meaningful edit, captures the sent
revision before awaiting, serializes provider requests, refuses to let stale A success or failure
clear/acknowledge B, and deterministically rearms B after A leaves the in-flight state. The shared
production seam is exercised by a real suspended A/B regression, and the correction stays inside
Ruling 2's three-file scope.
