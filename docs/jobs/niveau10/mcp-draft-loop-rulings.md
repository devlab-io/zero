# MCP draft-loop rulings

## 2026-07-14 — Broad inherited ESLint baseline after builder 1

- Builder 1 produced 30/30 focused passing tests, a passing draft-only security surface, passing touch/diff audits, and a separate green generated TypeScript pass after correcting `TextDecoder` options.
- The frozen ESLint target traversed all agent routes and drivers and failed on 14 inherited errors, including files outside this slice. It therefore did not measure the draft-loop delta truthfully.
- The corrected gate lints the changed MCP routes, tests, and new/shared draft helpers, and runs Prettier over the Outlook driver plus all agent documentation. The generated full-server typecheck, security surface, focused tests, touch audit, and diff hygiene remain unchanged.
- Existing lint findings in untouched Outlook lines are not silently waived as product quality; the Outlook file remains format-checked and fully typechecked, while the slice tests exercise its reply-draft seam.
- A fresh builder must consume this ruling, run all corrected frozen commands, and issue a new report. Builder 1 remains blocked evidence, not an accepted result.

## 2026-07-14 — Judge 1 FAIL: provider-normalized bodies report false failure

- Independent judge 1 passed check integrity and all six frozen RUNs, then reproduced a real semantic failure in `updateDraft`.
- The handler sends the requested body to the provider, refetches the same draft, and compares the persisted body byte-for-byte with the raw input. Gmail and Outlook both pass writes through `sanitizeTipTapHtml`, which stores a complete normalized HTML document, so a valid provider mutation can be followed by a tool error.
- The current focused smoke hides the defect because its fake stores the raw input unchanged. Judge evidence is `docs/jobs/niveau10/mcp-draft-loop-judge-1.md`.
- The corrective builder must replace raw byte equality with a provider-aware canonical or semantic persistence check that still proves the same draft ID and a fresh revision. It must add at least one behavioral test whose fake applies the real sanitizer before refetch, and prove success for both create/get/update while stale revisions still produce zero mutation.
- No relaxation of ownership, idempotency, draft-only, or human-send boundaries is authorised. Merge remains blocked until a fresh builder, fresh deterministic checkrun, and fresh independent judge all pass.
