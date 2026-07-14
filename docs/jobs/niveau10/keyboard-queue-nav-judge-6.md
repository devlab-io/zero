# Architect judge: keyboard queue navigation — loop 6

Checks integrity: PASS

Raw evidence:

```text
freeze_sha=bc41aa70c29865f92d595b7ed7390b1f9af5bdb8
current_head=e2f7e23d8e000d2a4e053cc285e3a830d605699b
checkrun_code_head=07d2ead06f780407c3d4fdcc8363f924c04f5fca
checkrun_integrity=check_file_matches_freeze=true

sha256 at freeze: e1f45cf140d2beba867de00f14f3c7da930d1a99d322c64031c466821fd77f06
sha256 current:   e1f45cf140d2beba867de00f14f3c7da930d1a99d322c64031c466821fd77f06

git diff bc41aa70c29865f92d595b7ed7390b1f9af5bdb8..HEAD -- docs/checks/
<no output>

git diff --name-only 07d2ead06f780407c3d4fdcc8363f924c04f5fca..HEAD
docs/jobs/niveau10/keyboard-runtime-checkrun.md
```

The frozen check is byte-identical to the freeze. The current implementation is the same code inspected by the checkrun; only its evidence document was refreshed afterward.

Diff vs intent: FAIL

The correction stays inside the authorised registry/manifest/test/report files and does not touch queue presentation. However, it stops at declaring and testing the new actions in a synthetic probe. It does not wire `focusNext` or `focusPrevious` into the real `QueueReview`, so four of the six required production key variants remain inert.

## Correctness finding

### [P1] Queue navigation actions are declared but absent from the real QueueReview handler map

The registry correctly adds `j` and `ArrowDown` → `focusNext`, `k` and `ArrowUp` → `focusPrevious`, and `Enter`/`Space` → `openSelected` at `apps/mail/config/shortcuts.ts:275-286`. `QUEUE_HANDLED_ACTIONS` also lists both focus actions at `apps/mail/lib/hotkeys/handler-manifest.ts:78-85`.

But the production consumer filters the queue registry and passes a handler object containing only `approveSelected`, `rejectSelected`, and `openSelected` at `apps/mail/components/queue/queue-review.tsx:239-254`. There is no `focusNext` or `focusPrevious` implementation anywhere under `components/queue`; `selectedItemId` is changed only by initialization and row clicks at `apps/mail/components/queue/queue-review.tsx:137-146` and `apps/mail/components/queue/queue-review.tsx:337-351`.

This is not a harmless manifest mismatch: `dispatchShortcutEvent` explicitly skips any registry row whose action has no handler at `apps/mail/lib/hotkeys/use-hotkey-utils.ts:340-354`. Therefore real `j`, `ArrowDown`, `k`, and `ArrowUp` events in `QueueReview` call nothing and do not move selection. That violates frozen acceptance `docs/checks/niveau10/keyboard-runtime.md:30-32` and the latest ruling `docs/jobs/niveau10/keyboard-runtime-rulings.md:67-70`.

The green runtime test does not close the gap. Its test-only `QueueRuntimeProbe` accepts an arbitrary handler record at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:85-100`, and the test itself injects both missing focus handlers at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:261-288`. It proves the generic binder works when handlers exist, not that `QueueReview` supplies them. The parity test similarly compares the registry to the manually maintained manifest at `apps/mail/lib/hotkeys/keyboard-parity.test.ts:16-23` and `apps/mail/lib/hotkeys/keyboard-parity.test.ts:96-114`; it does not inspect the real consumer.

Required correction: implement `focusNext` and `focusPrevious` in `QueueReview` over the current `visibleItems`/`selectedItemId`, include them in the object passed to `useShortcuts`, and add a product-consumer regression so the real handler map cannot diverge from `QUEUE_HANDLED_ACTIONS`. This is behavioral wiring, not presentation work.

## Requested acceptance audit

1. **Exact queue registry matrix and no `ignore`: PASS.** `apps/mail/config/shortcuts.ts:275-286` contains exactly eleven queue rows: the six requested navigation/open variants plus `d/a/r/f/h`; none sets `ignore`. The exhaustive matrix assertion is at `apps/mail/lib/hotkeys/keyboard-parity.test.ts:96-114`.

2. **Exhaustive manifest, QueueReview consumption, and no native queue listener: FAIL.** The manifest contains the five unique actions and `QueueReview` calls `useShortcuts`, while `rg` finds no native `document.addEventListener('keydown', ...)` under `apps/mail/components/queue`. But `QueueReview` omits the two focus handlers from the object supplied to the binder at `apps/mail/components/queue/queue-review.tsx:241-254`, so it does not consume the manifest exhaustively.

3. **Six real KeyboardEvent variants, six exact calls, no input/contenteditable/dialog leak, one binder listener: PASS for the isolated binder probe; FAIL for the production queue path.** The test creates six bubbling `KeyboardEvent` instances, asserts `['next', 'next', 'previous', 'previous', 'open', 'open']`, repeats them against input/contenteditable/dialog descendants with no additional call, and spies exactly one document keydown registration at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:261-318`. All assertions pass. However the probe supplies handlers the real component lacks, so four navigation calls cannot occur in production.

4. **No queue presentation change in this correction: PASS.** The queue component hash is identical at freeze and current HEAD (`f22a145c09d9bd045867362c06fb9fc291401ebc20fa212554829d81f0d7bc8b`), and the freeze-to-code diff touches no file under `apps/mail/components/queue`, queue routes, or message catalogs.

5. **Frozen check intact and all five RUNs exit zero: PASS.** The checkrun records exit 0 for RUN lines 9–13, `docs_checks_touched=false`, and `check_file_matches_freeze=true`. Independent hash/diff verification agrees.

6. **TypeScript diagnostics are outside the touch-set and complete build is green: PASS.** Independent rerun reported only:

```text
lib/server-tool.ts(21,31): error TS2558: Expected 0 type arguments, but got 1.
../server/src/types.ts(184,46): error TS2304: Cannot find name 'Env'.
```

Neither path matches the frozen keyboard/queue owner regex. The negative `rg` gate passed and the full React Router client/SSR build completed with overall exit 0.

## Frozen RUN evidence

### RUN line 9 — focused tests: PASS

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
✓ lib/hotkeys/keyboard-runtime.test.tsx (9 tests) 1336ms
Test Files 3 passed (3)
Tests 39 passed (39)
Duration 1.84s
exit: 0
```

This matches the evidence-file counts and pass state; only nondeterministic timings differ.

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

The warnings are the recorded React-hook warnings in existing composer, queue, and mail-list files.

### RUN line 11 — owner-scoped TypeScript and full build: PASS

Command:

```sh
pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build
```

Source: independently re-run at current HEAD, with a judge-specific temporary log path to avoid overwriting the evidence log.

Raw decisive output and exit:

```text
✔ [paraglide-js] Compilation complete (message-modules)
lib/server-tool.ts(21,31): error TS2558: Expected 0 type arguments, but got 1.
../server/src/types.ts(184,46): error TS2304: Cannot find name 'Env'.
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command failed with exit code 1: tsc --noEmit --pretty false
...
✓ 5537 modules transformed.
✓ built in 11.06s
✓ 982 modules transformed.
Prerender (html): /manifest.webmanifest
Prerender (html): /
Prerender (html): SPA Fallback
✓ built in 7.26s
exit: 0
```

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

Slice verdict: FAIL

Decisive reason: despite intact evidence and green frozen commands, the real queue consumer does not provide `focusNext` or `focusPrevious` to `useShortcuts`; `j/k` and arrow navigation therefore remain inert. The tests pass only because a synthetic probe injects handlers that production omits.
