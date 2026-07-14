# Keyboard runtime rulings

## 2026-07-14 — Check repair after builder Phase 0

- The first builder run completed the scoped product implementation and passed 33/33 focused tests, lint with pre-existing warnings only, and `git diff --check`.
- The frozen build command was incomplete for a clean `--ignore-scripts` install: `react-router typegen` must run before the mail build so Paraglide and route artifacts exist. The orchestrator reproduced a successful build with that prerequisite.
- The frozen touch-set regular expression named the `lib/hotkeys/` and settings shortcut directories without a suffix wildcard, so it rejected their authorised contents. Directory alternatives now match descendants explicitly.
- These are check-contract corrections. They do not widen the product acceptance criteria or the MAY TOUCH boundary.
- A fresh builder must rerun every corrected frozen check and update `docs/jobs/niveau10/keyboard-runtime-01.md`; no implementation is accepted from the blocked report alone.

## 2026-07-14 — Untracked report path precision

- Plain `git status --porcelain` collapses a newly created untracked report directory to `docs/jobs/niveau10/`, causing the touch-set check to reject the authorised report before it is committed.
- The touch-set command now requests `--untracked-files=all`; the allowed product and report paths are unchanged.

## 2026-07-14 — Sandboxed Paraglide fetch versus deterministic runner

- The fresh builder passed 35/35 focused tests, focused lint, the corrected touch-set audit, and diff hygiene, but its sandbox could not fetch the two jsDelivr Paraglide plugins; type generation then produced incomplete message exports and React Router prerender failed.
- The orchestrator's deterministic check-runner reran the exact frozen `react-router typegen && build` command outside the network-restricted builder sandbox. Plugin compilation and the full production build exited 0, while every other frozen command also exited 0.
- The authoritative independent evidence is `docs/jobs/niveau10/keyboard-runtime-checkrun.md`; no product fallback or check weakening is authorised.

## 2026-07-14 — Judge 1 FAIL: AltGr and contextual help

- Independent judge 1 returned `Slice verdict: FAIL` even though every frozen RUN passed.
- `shortcutMatchesEvent` rejects a common AZERTY AltGr representation because browsers may expose AltGr as `Ctrl+Alt`; sequence dispatch also rejects any `ctrlKey`. The corrective test must include a produced punctuation event with `ctrlKey: true` and `altKey: true`, without allowing command/control chords to bypass scope rules.
- `Shift+?` currently navigates to `/settings/shortcuts`. The accepted spec requires an in-place contextual shortcut sheet without leaving the inbox; the fresh builder must implement that within the authorised hotkey/settings surface and add an observable test.
- Judge evidence is `docs/jobs/niveau10/keyboard-runtime-judge-1.md`. The orchestrator cannot merge until a fresh builder, fresh checkrun, and fresh independent judge all pass.

## 2026-07-14 — Judge 2 FAIL: contextual labels only partially localized

- Independent judge 2 verified both previous corrections: Ctrl+Alt AltGr punctuation is scope-safe, and `Shift+?` opens the contextual sheet in place while preserving the inbox route.
- The slice still failed because active `global` and `navigation` actions `goToStarred`, `goToSnoozed`, `toggleTheme`, and `toggleSidebar` fall back to raw internal identifiers in the contextual sheet.
- The corrective builder must provide explicit English and French catalog labels for every active contextual action and add a regression proving no active action falls back to its identifier.
- The MAY TOUCH boundary and frozen touch audit now include only `apps/mail/messages/en.json` and `apps/mail/messages/fr.json` in addition to the prior keyboard/settings surface. No other message catalog or product area is authorised.
- Merge remains blocked until a fresh builder, fresh checkrun under the new freeze, and fresh independent judge all pass.

## 2026-07-14 — Judge 3 FAIL: `thread-display` action omitted

- Independent judge 3 verified the AltGr correction, the in-place `Shift+?` sheet, the four labels from judge 2, and all five frozen RUNs.
- Its exhaustive registry audit found a fifty-fifth inbox action: `archivePrevious` is active in the `thread-display` scope whenever a thread is open, but it is absent from the contextual label map and from both EN/FR catalogs.
- Because the sheet now correctly fails loudly on an unknown action, this omission crashes contextual help instead of rendering a complete localized sheet for that valid scope.
- The corrective builder must add an explicit `archivePrevious` mapping and EN/FR labels, then replace the partial `global` + `navigation` regression with an exhaustive assertion over every canonical action that the inbox can activate, including `thread-display`.
- The v6 MAY TOUCH boundary and frozen commands already authorize the required component, catalogs, and test changes; no check-contract amendment or scope expansion is needed.
- Merge remains blocked until a fresh builder, fresh deterministic checkrun, and fresh independent judge all pass.

## 2026-07-14 — Generated-type gate exposed a test-global error

- The downstream search slice ran the blocking mail typecheck after `react-router typegen` and exposed `TS7017` on `globalThis.IS_REACT_ACT_ENVIRONMENT` in `keyboard-runtime.test.tsx`.
- The keyboard production build and focused Vitest suite did not typecheck test globals, so the earlier frozen keyboard command could not detect it.
- The keyboard frozen build command now runs `tsc --noEmit` after type generation and before the production build. A fresh correction builder may change only the test-global assignment required to satisfy that gate.
- Search/triage remains blocked until this owner-slice correction is independently checked and integrated into a new freeze.

## 2026-07-14 — Owner-scoped TypeScript gate breaks a cross-slice cycle

- Correction builder 2 removed the keyboard-owned `TS7017`; 37/37 tests, focused ESLint, touch audit and diff hygiene passed.
- A complete generated mail `tsc` then failed only on `mail-list-thread.tsx:232`, a search/triage-owned prefetch guard already corrected on that job branch. The two additional errors seen before Wrangler generation disappeared after the full `server types` + `mail types` setup, confirming setup drift rather than product defects.
- Requiring global mail=0 inside the keyboard slice creates a dependency cycle: search consumes the corrected keyboard freeze while the keyboard check waits for a search-owned file. The keyboard gate is therefore narrowed to reject TypeScript errors in its authorised touch-set and still runs the full production build; the search slice retains the global blocking mail=0 gate.
- A fresh builder must rerun the corrected owner-scoped command. The cast from builder 2 is not integrated from a BLOCKED report alone.

## 2026-07-14 — La navigation queue manquait au registre canonique

- Le builder UX a constaté que le registre `queue` ne contient que `d/a/r/f/h`, tandis que
  l'acceptation UX exige aussi `j/k`, les flèches, `Enter` et `Space`.
- Une première adaptation locale réutilisait les entrées `list` via un nouveau listener
  `document.keydown`. Cela aurait contourné le binder canonique, ses scopes et ses gardes
  input/editor/dialog ; cette approche est refusée.
- La correction propriétaire doit ajouter les variantes de navigation au scope `queue`, étendre le
  manifeste de handlers et prouver par événements réels que chaque variante appelle exactement une
  fois le bon handler sans fuite de scope. `QueueReview` doit ensuite les consommer via
  `useShortcuts` ; aucun listener clavier natif parallèle n'est accepté.
- Aucun changement visuel de la queue n'est autorisé dans cette correction. L'UX reprend la
  présentation et le pending par item après intégration du nouveau freeze clavier.
