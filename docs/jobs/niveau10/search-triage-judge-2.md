# Search/Triage — Judge 2

- Checks integrity: PASS
  Raw evidence:

```text
$ git diff ceabd4689f24964033db9aab83a1eb181a343bd8..HEAD -- docs/checks/
[no output]
exit: 0

docs/jobs/niveau10/search-triage-checkrun.md:
freeze_sha: ceabd4689f24964033db9aab83a1eb181a343bd8
integrity: check_file_matches_freeze=true head=45c3a297e8cba82461b338c5a7f8c5b4ca459c01
docs_checks_touched=false

$ git diff --name-status 45c3a297e8cba82461b338c5a7f8c5b4ca459c01..HEAD
M	docs/jobs/niveau10/search-triage-checkrun.md
```

  The evidence is current: its recorded product head is the direct parent of the current evidence
  commit, and the only later change is the committed checkrun artifact itself. The worktree was
  clean before and after judgment.

- Diff vs intent: PASS
  Raw evidence:

  - Reset uses the live URL-backed setters, not a parallel state model.
    `apps/mail/components/context/command-palette-context.tsx:72-77` obtains
    `useSearchLabels().setLabels` and `useQueryState('category')`; lines 98-108 call both through
    `clearMailQueryFilters`, clear persisted active filters, and reset lexical/AI state.
    `apps/mail/hooks/use-labels-search.ts:28-35,37-55` proves that an empty label selection writes
    `labels=null` and category writes `null`. The mounted provider test observes both concrete
    writes at `apps/mail/components/context/command-palette-context.test.tsx:175-185`.
  - Label/category-only results are classified as filtered. The complete predicate is
    `apps/mail/hooks/use-labels-search.ts:4-20`; `MailList` feeds it text, labels, category and
    active-filter count at `apps/mail/components/mail/mail-list.tsx:129-134`, then renders a
    distinct filtered no-results state at lines 235-259. The label-only positive and unfiltered
    negative cases are asserted at
    `apps/mail/components/context/command-palette-search.test.tsx:252-284`.
  - There is one successor algorithm. `runThreadRemovalNavigation` finds the target by identity on
    the immutable list, runs the mutation, then restores URL and focus in that order at
    `apps/mail/hooks/use-mail-navigation.ts:31-53`. Reader clicks consume it at
    `apps/mail/components/mail/thread-display.tsx:143-174`; row archive/bin clicks consume it at
    `apps/mail/components/mail/mail-list-thread.tsx:166-177`, are passed to the row action surface at
    lines 244-252, and its visible archive/bin buttons invoke that callback at
    `apps/mail/components/mail/mail-list-thread-actions.tsx:89-120`; archive next/previous, snooze,
    move-to-bin and permanent delete hotkeys all
    consume the same seam at `apps/mail/lib/hotkeys/thread-display-hotkeys.tsx:46-77,120-139`.
    Thus an optimistic `threadId=null` occurs inside `mutate` before the restoring setters and
    cannot overwrite the selected successor.
  - The production seam is exercised successively for 1, 2 and 20 rows, with the mutation
    deliberately clearing URL/focus before restoration, at
    `apps/mail/components/mail/thread-triage.test.tsx:5-68`; archive-previous identity/index is
    covered at lines 70-94. The test contains no second successor calculation.
  - `/` remains on the certified registry/binder path. The canonical row is
    `apps/mail/config/shortcuts.ts:125-131`; `GlobalHotkeys` maps the existing `search` action to
    lexical-view then palette state at `apps/mail/lib/hotkeys/global-hotkeys.tsx:27-34` and binds it
    through `useShortcuts` at lines 46-48. The slice adds no native `/` keydown listener. The
    existing palette listeners only own Cmd/Ctrl+K and in-palette modifier/Escape actions.
  - Enter is lexical by default: `SearchView` prevents default and calls
    `handleSearch(query, false)` at
    `apps/mail/components/context/command-palette-views.tsx:236-248`; recent searches are also
    lexical at lines 259-269. AI exists only as the explicit Smart Search item at lines 306-319.
    cmdk 1.0.0 checks `event.defaultPrevented` before dispatching its selected item, so the stopped
    Enter cannot additionally select Smart Search. The behavioral assertion is
    `apps/mail/components/context/command-palette-search.test.tsx:287-300`.
  - Quick results filter and render `sender` at
    `apps/mail/components/context/command-palette-dialog.tsx:346-381` and
    `apps/mail/components/context/command-palette-views.tsx:274-300`; they navigate to the exact
    `/mail/inbox?threadId=…` route at lines 279-289. `QuickSearchThread` changes only its projection
    field from `from` to `sender` at `apps/mail/components/context/command-registry.ts:66-72`; no
    command definition, shortcut or binder changed. Twenty deterministic sender/route cases pass
    at `apps/mail/components/context/command-palette-search.test.tsx:302-327`.
  - Important feedback is truthfully ordered by `runImportantToggle` at
    `apps/mail/components/mail/thread-display.triage.tsx:8-23`; the real reader mutation wires
    success/error at `apps/mail/components/mail/thread-display.tsx:186-207`, and both outcomes are
    tested at `apps/mail/components/mail/thread-triage.test.tsx:96-126`.
  - Touched reader-header controls are named and sized: the shared button uses `aria-label` and
    44 px mobile / 40 px desktop targets at
    `apps/mail/components/mail/thread-display.action-button.tsx:20-33`; close, reply-all, star,
    archive, bin and overflow actions carry accessible names and the same target minima at
    `apps/mail/components/mail/thread-display.tsx:357-477`.
  - The warm latency test dispatches twenty real cancelable slash `KeyboardEvent`s through the
    actual `GlobalHotkeys`, observes one lexical/palette state write and actual input focus for
    every opening, computes p75, and asserts `<100 ms` at
    `apps/mail/components/context/command-palette-search.test.tsx:329-397`. This is a real
    happy-dom event-to-focus measurement. Per the frozen check, real-browser latency remains
    deferred to final Computer Use and is not claimed here.

- Per check:
  - RUN line 9: PASS
    Command: `pnpm --filter @zero/mail exec vitest run components/context/command-palette-context.test.tsx components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx`
    Executor: bash
    Source: evidence-file
    Raw evidence:

```text
exit: 0

 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/search-triage-01/apps/mail

stderr | components/mail/thread-triage.test.tsx
KeyboardLayoutMap API is not supported in this browser

stderr | components/context/command-palette-search.test.tsx
KeyboardLayoutMap API is not supported in this browser

 ✓ components/context/command-palette-search.test.tsx (23 tests) 94ms
 ✓ components/context/command-palette-context.test.tsx (6 tests) 20ms
 ✓ components/mail/thread-triage.test.tsx (6 tests) 4ms

 Test Files  3 passed (3)
      Tests  35 passed (35)
   Duration  1.78s
```

  - RUN line 10: PASS
    Command: `pnpm --filter @zero/mail exec eslint components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx components/mail/thread-display.action-button.tsx components/mail/mail-list.tsx components/mail/mail-list-thread.tsx components/mail/mail.tsx hooks/use-labels-search.ts hooks/use-mail-navigation.ts lib/hotkeys/global-hotkeys.tsx lib/hotkeys/thread-display-hotkeys.tsx && pnpm exec prettier apps/mail/components/context/command-palette-context.test.tsx apps/mail/components/context/command-palette-context.tsx apps/mail/components/context/command-palette-dialog.tsx apps/mail/components/context/command-palette-views.tsx apps/mail/components/context/command-palette-search.test.tsx apps/mail/components/context/command-registry.ts apps/mail/components/mail/mail.tsx apps/mail/components/mail/mail-list.tsx apps/mail/components/mail/mail-list-thread.tsx apps/mail/components/mail/thread-display.tsx apps/mail/components/mail/thread-display.action-button.tsx apps/mail/components/mail/thread-display.triage.tsx apps/mail/components/mail/thread-triage.test.tsx apps/mail/hooks/use-labels-search.ts apps/mail/hooks/use-mail-navigation.ts apps/mail/lib/hotkeys/global-hotkeys.tsx apps/mail/lib/hotkeys/thread-display-hotkeys.tsx --check`
    Executor: bash
    Source: evidence-file
    Raw evidence:

```text
exit: 0
✖ 8 problems (0 errors, 8 warnings)
Checking formatting...
All matched files use Prettier code style!
```

  - RUN line 11: PASS
    Command: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`
    Executor: bash
    Source: evidence-file
    Raw evidence:

```text
exit: 0
Runtime types generated.
Types written to worker-configuration.d.ts
✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
```

  - RUN line 12: PASS
    Command: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(components\/context\/(command-palette-context(\.test)?\.tsx|command-palette-dialog\.tsx|command-palette-views\.tsx|command-palette-search\.test\.tsx|command-registry\.ts)|components\/mail\/(mail\.tsx|mail-list\.tsx|mail-list-thread\.tsx|thread-display(\.[^.]+)?\.tsx|thread-triage\.test\.tsx)|hooks\/(use-labels-search|use-mail-navigation)\.ts|lib\/hotkeys\/(global-hotkeys|thread-display-hotkeys)\.tsx)|docs\/jobs\/niveau10\/search-triage-01\.md)$/ {print; bad=1} END {exit bad}'`
    Executor: bash
    Source: evidence-file
    Raw evidence:

```text
exit: 0
[no output]
```

  - RUN line 13: PASS
    Command: `git diff --check`
    Executor: bash
    Source: re-run
    Raw evidence:

```text
evidence-file:
exit: 0  ms: 16  bytes: 0
[no output]

re-run:
exit: 0
[no output]
```

    The re-run exactly matches the evidence-file result: exit 0 with empty stdout/stderr.

- Slice verdict: PASS
  Decisive reason: the frozen check is intact and current, all five mechanical RUNs pass, and the
  independent source audit confirms the real reset, event-to-focus search, lexical Enter,
  sender/route, truthful feedback, accessible header and identity-first post-mutation navigation
  paths required by the slice.

MIRROR: ORCHESTRATOR
