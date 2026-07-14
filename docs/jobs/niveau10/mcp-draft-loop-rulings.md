# MCP draft-loop rulings

## 2026-07-14 — Broad inherited ESLint baseline after builder 1

- Builder 1 produced 30/30 focused passing tests, a passing draft-only security surface, passing touch/diff audits, and a separate green generated TypeScript pass after correcting `TextDecoder` options.
- The frozen ESLint target traversed all agent routes and drivers and failed on 14 inherited errors, including files outside this slice. It therefore did not measure the draft-loop delta truthfully.
- The corrected gate lints the changed MCP routes, tests, and new/shared draft helpers, and runs Prettier over the Outlook driver plus all agent documentation. The generated full-server typecheck, security surface, focused tests, touch audit, and diff hygiene remain unchanged.
- Existing lint findings in untouched Outlook lines are not silently waived as product quality; the Outlook file remains format-checked and fully typechecked, while the slice tests exercise its reply-draft seam.
- A fresh builder must consume this ruling, run all corrected frozen commands, and issue a new report. Builder 1 remains blocked evidence, not an accepted result.
