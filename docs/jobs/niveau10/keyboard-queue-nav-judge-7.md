# Architect judge: keyboard queue navigation — loop 7

Checks integrity: PASS

Raw evidence:

```text
freeze_sha=f097e61f0940decbeed1684118c2bb32a02dd6f8
current_head=83c1bcbf0779b0b34ebff0a8a82797400b3feea6
checkrun_code_head=689d60c652b374336c520d07fe2da1622a2625d6
checkrun_integrity=check_file_matches_freeze=true
docs_checks_touched=false

sha256 at freeze: e1f45cf140d2beba867de00f14f3c7da930d1a99d322c64031c466821fd77f06
sha256 current:   e1f45cf140d2beba867de00f14f3c7da930d1a99d322c64031c466821fd77f06

git diff f097e61f0940decbeed1684118c2bb32a02dd6f8..HEAD -- docs/checks/
<no output>

git diff --name-only 689d60c652b374336c520d07fe2da1622a2625d6..HEAD
docs/jobs/niveau10/keyboard-runtime-checkrun.md
```

The frozen contract is byte-identical to the new freeze. The current implementation is the same code covered by the checkrun; only the refreshed checkrun document follows the code commit.

Diff vs intent: PASS

The decisive correction is limited to production queue-navigation wiring, a pure navigation helper, its focused regression, and the raw report. In `QueueReview`, nonfunctional differences are formatter-only import ordering, JSX line wrapping, and utility-class ordering; no pending, mobile, layout, copy, status, action, or rendering behavior was added or removed.

## Findings

No correctness finding against the frozen contract or latest ruling.

## Decisive correction audit

1. **Real QueueReview handler map is exhaustive and manifest-typed: PASS.** `apps/mail/components/queue/queue-review.tsx:244-260` declares `Record<(typeof QUEUE_HANDLED_ACTIONS)[number], () => void>` and supplies all five manifest actions: `focusNext`, `focusPrevious`, `approveSelected`, `rejectSelected`, and `openSelected`. The canonical manifest remains the five-action tuple at `apps/mail/lib/hotkeys/handler-manifest.ts:78-85`; TypeScript therefore rejects a future manifest action omitted by this consumer.

2. **Deterministic next/previous behavior over visible selection: PASS.** The two production handlers use functional `setSelectedItemId` updates against current `visibleItems` and call the shared resolver at `apps/mail/components/queue/queue-review.tsx:246-251`. `resolveQueueSelectionId` returns `null` for an empty list, wraps both ends, moves by one for an existing selection, and recovers a filtered-out selection to first/last according to direction at `apps/mail/lib/hotkeys/queue-navigation.ts:1-24`.

3. **Production algorithm is imported and tested, not copied: PASS.** The runtime test imports `resolveQueueSelectionId` from `./queue-navigation` at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:12-14`. Its regression at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:324-334` covers next/previous movement, forward/backward wrap, filtered-list recovery in both directions, and empty-list `null`.

4. **Existing open/approve/reject behavior remains intact: PASS.** `approveSelected`, `rejectSelected`, and `openSelected` still call the pre-existing `approveItem(selectedItem)`, `cancelItem(selectedItem)`, and `openItem(selectedItem)` paths at `apps/mail/components/queue/queue-review.tsx:252-258`. The baseline-to-correction diff changes none of those action bodies.

5. **Single canonical binder and no native queue listener: PASS.** `QueueReview` has exactly one `useShortcuts` call, with scope `queue`, at `apps/mail/components/queue/queue-review.tsx:263`. Source search finds no `document.addEventListener('keydown', ...)` below `apps/mail/components/queue`; navigation continues through the shared binder and its typing/modal guards.

6. **Registry matrix remains exact: PASS.** `apps/mail/config/shortcuts.ts:275-286` contains exactly eleven non-ignored queue rows: `j`/`ArrowDown` → `focusNext`, `k`/`ArrowUp` → `focusPrevious`, `Enter`/`Space` → `openSelected`, plus `d/a/r/f/h`. `apps/mail/lib/hotkeys/keyboard-parity.test.ts:96-114` asserts the ordered matrix and set equality with `QUEUE_HANDLED_ACTIONS`.

7. **Six real events and scope safety: PASS.** The runtime regression creates the six bubbling `KeyboardEvent` variants, observes exactly `next,next,previous,previous,open,open`, asserts a single document keydown registration, then repeats all variants from input, contenteditable, and dialog descendants without extra calls at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:265-322`. Its handler map is also typed from `QUEUE_HANDLED_ACTIONS` at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:87-105`.

8. **No substantive queue presentation/pending/mobile change: PASS.** The correction delta from baseline `968b0a5e44f36b07ef2fb91583e6bd6243a088f7` to code head changes queue behavior only through two imports, the typed handler map, and the two selection handlers. Remaining queue-component hunks are formatter output: line wrapping, import order, and ordering of non-conflicting Tailwind utilities. No pending/mobile logic, DOM structure, labels, status conditions, or action availability changed.

## Frozen RUN evidence

### RUN line 9 — focused runtime/parity/recipient tests: PASS

Command:

```sh
pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
```

Source: independently re-run at current HEAD.

Raw stdout/stderr and exit:

```text
RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-queue-nav-03/apps/mail
✓ components/mail/reply-recipients.test.ts (18 tests) 2ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser
✓ lib/hotkeys/keyboard-parity.test.ts (12 tests) 6ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser
✓ lib/hotkeys/keyboard-runtime.test.tsx (10 tests) 1283ms
Test Files 3 passed (3)
Tests 40 passed (40)
Duration 1.79s
exit: 0
```

This agrees with the evidence file on files, counts, and pass state; only nondeterministic timings differ.

### RUN line 10 — focused ESLint: PASS

Command:

```sh
pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx components/queue/queue-review.tsx app/'(routes)'/settings/shortcuts
```

Source: `docs/jobs/niveau10/keyboard-runtime-checkrun.md`.

Raw result:

```text
8 problems (0 errors, 8 warnings)
exit: 0
```

The eight warnings are the recorded existing React-hook dependency warnings; there is no lint error.

### RUN line 11 — owner-scoped TypeScript and complete build: PASS

Command: exact frozen typegen, owner-scope negative TypeScript grep, and `pnpm --filter @zero/mail build` command from `docs/checks/niveau10/keyboard-runtime.md:11`.

Source: `docs/jobs/niveau10/keyboard-runtime-checkrun.md`.

Raw decisive output and exit:

```text
checkrun metadata: exit: 0 ms: 25147 bytes: 36243 truncated
✔ [paraglide-js] Compilation complete (message-modules)
lib/server-tool.ts(21,31): error TS2558: Expected 0 type arguments, but got 1.
../server/src/types.ts(184,46): error TS2304: Cannot find name 'Env'.
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command failed with exit code 2: tsc --noEmit --pretty false
...
✓ 5538 modules transformed.
exit: 0
```

Both printed TypeScript diagnostics are outside the frozen keyboard/queue touch-set regex. There is no diagnostic for `queue-review.tsx`, `queue-navigation.ts`, the hotkey surface, or any other owner-scoped path. The runner truncates the asset manifest, but its recorded overall exit 0 proves the chained complete production build finished successfully.

### RUN line 12 — touch set: PASS

Command: exact frozen `git status --porcelain --untracked-files=all | ... | awk ...` command from `docs/checks/niveau10/keyboard-runtime.md:12`.

Source: `docs/jobs/niveau10/keyboard-runtime-checkrun.md`.

Raw stdout/stderr and exit:

```text
<no output>
exit: 0
```

### RUN line 13 — diff hygiene: PASS

Command:

```sh
git diff --check
```

Source: evidence file and independently re-run.

Raw stdout/stderr and exit:

```text
<no output>
exit: 0
```

All five frozen RUNs recorded exit 0. The judge independently re-ran the decisive focused suite and diff hygiene, and inspected the remaining command evidence before grading.

Slice verdict: PASS

Decisive reason: the real `QueueReview` now supplies an exhaustive manifest-typed handler map, its focus actions execute the imported and tested deterministic wrap/filter/empty algorithm over the visible selection, the shared scoped binder remains the sole queue key listener, and all frozen evidence is valid and green.
