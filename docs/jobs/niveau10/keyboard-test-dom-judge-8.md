# Architect judge: keyboard test DOM correction 5

Checks integrity: PASS

Raw evidence:

```text
freeze_sha=56e5caf40fb25c489fbe184a194f1ca5bb4cf39d
HEAD=56e5caf40fb25c489fbe184a194f1ca5bb4cf39d
checkrun_integrity=check_file_matches_freeze=true
docs_checks_touched=false

git diff 56e5caf40fb25c489fbe184a194f1ca5bb4cf39d -- docs/spec docs/checks docs/jobs/niveau10/keyboard-runtime-rulings.md
<no output>

git status --porcelain=v1
 M apps/mail/lib/hotkeys/keyboard-runtime.test.tsx
 M docs/jobs/niveau10/keyboard-runtime-01.md
```

The frozen check is unchanged. HEAD intentionally equals the freeze; the judged correction is the two-file working-tree delta exercised by the deterministic runner. Its `changed_files: 0` metadata describes the committed HEAD delta, while frozen RUN line 12 separately audits the actual working-tree paths and exits zero.

Diff vs intent: PASS

The exact delta against the freeze is:

```text
apps/mail/lib/hotkeys/keyboard-runtime.test.tsx | 4 +--
docs/jobs/niveau10/keyboard-runtime-01.md       | 97 insertions
2 files changed, 100 insertions(+), 1 deletion(-)
```

The only executable change replaces one test-only variadic `document.body.append(input, editor, dialog)` call with three single-node `appendChild` calls at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:294-303`. The rest is the required raw report. No production file, spec, frozen check, ruling, configuration, dependency, generated artifact, or test assertion changed.

## Findings

No correctness finding against the freeze or latest ruling.

## Correction audit

1. **The TS2554 cause is actually removed: PASS.** The ruling identifies the Workers-type incompatibility specifically at the multi-argument body append (`docs/jobs/niveau10/keyboard-runtime-rulings.md:88-97`). The judged test now invokes only `Node.appendChild` once per node at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:301-303`, eliminating the incompatible variadic signature rather than casting it away or weakening TypeScript.

2. **Complete Workers type environment is exercised: PASS.** Frozen RUN line 11 runs `@zero/server types`, then `@zero/mail types`, then React Router typegen, then the owner-scoped `tsc`, then the full mail build (`docs/checks/niveau10/keyboard-runtime.md:11`). The deterministic runner records both Wrangler generations and an overall exit 0. The judge independently re-ran the same chain with a judge-specific temporary TypeScript log; the log was exactly 0 bytes and the client/SSR build exited zero.

3. **Behavior is unchanged: PASS.** Before and after the correction, the same detached `input`, contenteditable `editor`, and `dialog` are inserted into `document.body` in the same order before event dispatch. `appendChild` return values are unused. The same six real queue events are sent to the same three targets, the same no-leak assertion remains, and the same three nodes are removed afterward at `apps/mail/lib/hotkeys/keyboard-runtime.test.tsx:305-320`. Independent focused execution passes all 40 tests.

4. **The correction is minimal and does not broaden scope: PASS.** The executable diff is three insertions and one deletion in one test file. No product/runtime module changes, and the touch-set contains only the authorised test plus the report. The spec, check, and rulings have no working-tree diff.

5. **No check weakening or diagnostic hiding: PASS.** The fix does not add a cast, suppression, `skipLibCheck`, conditional exclusion, altered regex, or ignored test. The frozen gate is stronger than the previous version because it generates both Workers type surfaces before `tsc`; its TypeScript log is empty rather than merely filtered outside the owner scope.

## Frozen RUN evidence

### RUN line 9 — focused runtime/parity/recipient tests: PASS

Command:

```sh
pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts
```

Source: independently re-run by this judge at the judged working-tree state.

Raw stdout/stderr and exit:

```text
RUN v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/keyboard-test-dom-04/apps/mail
✓ components/mail/reply-recipients.test.ts (18 tests) 3ms
stderr | lib/hotkeys/keyboard-parity.test.ts
KeyboardLayoutMap API is not supported in this browser
✓ lib/hotkeys/keyboard-parity.test.ts (12 tests) 7ms
stderr | lib/hotkeys/keyboard-runtime.test.tsx
KeyboardLayoutMap API is not supported in this browser
✓ lib/hotkeys/keyboard-runtime.test.tsx (10 tests) 1230ms
Test Files 3 passed (3)
Tests 40 passed (40)
Duration 1.74s
exit: 0
```

This matches the runner evidence on files, counts, and pass state; only nondeterministic timing differs.

### RUN line 10 — focused ESLint: PASS

Command:

```sh
pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx components/queue/queue-review.tsx app/'(routes)'/settings/shortcuts
```

Source: deterministic runner evidence.

Raw result:

```text
8 problems (0 errors, 8 warnings)
exit: 0
```

The eight warnings are the existing React-hook dependency warnings in composer, queue, and mail-list files; the changed test has no lint error.

### RUN line 11 — complete Workers types, scoped TypeScript gate, and production build: PASS

Command:

```sh
pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build
```

Source: deterministic runner plus independent judge re-run using `/tmp/zero-niveau10-keyboard-judge8-tsc.log`.

Raw decisive evidence:

```text
@zero/server: Generating project types... Runtime types generated.
@zero/mail: Generating project types... Runtime types generated.
✔ [paraglide-js] Compilation complete (message-modules)
judge TypeScript log size: 0 bytes
✓ 5538 client modules transformed.
✓ built in 10.83s
✓ 983 SSR modules transformed.
Prerender (html): /manifest.webmanifest
Prerender (html): /
Prerender (html): SPA Fallback
✓ built in 6.95s
exit: 0
```

### RUN line 12 — touch set: PASS

Command: exact frozen `git status --porcelain --untracked-files=all | ... | awk ...` command at `docs/checks/niveau10/keyboard-runtime.md:12`.

Source: deterministic runner evidence.

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

Source: deterministic runner and independent judge re-run.

Raw stdout/stderr and exit:

```text
<no output>
exit: 0
```

All five frozen RUNs in `/Users/thomasverdenne/cc/zero-niveau10/.architect/checkruns/keyboard-test-dom-v14-checkrun.md` record exit 0. The judge independently reproduced the two decisive checks: all 40 focused tests pass, and the complete Workers-type/TypeScript/build chain exits zero with an empty TypeScript log.

Slice verdict: PASS

Decisive reason: the single test-only DOM call that produced TS2554 under complete Workers types is replaced by the minimally equivalent single-node API, the fully generated TypeScript environment is clean, runtime behavior and assertions are unchanged, and scope remains limited to the authorised test and report.
