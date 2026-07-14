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

## 2026-07-14 — Judge 2 FAIL: Gmail reply MIME lacks threading headers

- Independent judge 2 verified the provider-normalized update correction and passed all six frozen RUNs, but found that Gmail reply drafts only carry the API `threadId`, matching subject, recipients, and body.
- Gmail's threading contract also requires RFC-compliant `In-Reply-To` and `References` headers. The current MIME builder emits neither, so `createReplyDraft` cannot guarantee that Gmail places the draft in the intended thread. Outlook already uses Graph `createReply` and is not affected.
- The existing Gmail regression asserts only the JSON `threadId`, which cannot detect this defect. Judge evidence is `docs/jobs/niveau10/mcp-draft-loop-judge-2.md`.
- The corrective builder must derive the owned source message's RFC Message-ID server-side, add injection-safe `In-Reply-To` and `References` headers to Gmail reply MIME, and test by decoding the produced raw MIME as well as asserting the API `threadId`. Missing or malformed source Message-ID must fail safely before a provider draft mutation rather than silently create an unthreaded draft.
- No client-supplied threading header is authorised. Merge remains blocked until a fresh builder, fresh deterministic checkrun, and fresh independent judge all pass.

## 2026-07-14 — Judge 3 FAIL: pre-read revision is not provider CAS

- Independent judge 3 verified the provider-normalized update and Gmail MIME threading corrections and passed all six frozen RUNs, but found a time-of-check/time-of-use overwrite window.
- `updateDraft` compares the supplied revision to a fetched projection, then performs an unconditional Gmail `drafts.update` or Outlook message patch. A provider edit between those operations can therefore be overwritten even though the caller's revision is stale.
- The official Gmail discovery contract exposes an immutable draft ID and an unconditional content-replacing `PUT`, but no per-draft ETag/version token. Microsoft message resources expose `changeKey`, while the public message-update contract does not document an `If-Match` precondition. Sources: https://gmail.googleapis.com/$discovery/rest?version=v1 and https://learn.microsoft.com/en-us/graph/api/message-update?view=graph-rest-1.0.
- The accepted contract is fail-closed: a driver may mutate only when it supplies a provider-native conditional-write token bound to the returned revision and the write uses that token atomically. Otherwise `updateDraft` must advertise the limitation and reject before any provider effect. A local mutex or read-check-write sequence is not provider CAS and is forbidden as a substitute.
- Capabilities, tool output, Codex/Claude docs, snapshot, and smoke evidence must state which active provider supports safe update and instruct agents to create a new unsent draft when it does not. The smoke must cover both a CAS fake with a concurrent-edit `412` equivalent and a no-CAS fake with zero mutation.
- Judge evidence is `docs/jobs/niveau10/mcp-draft-loop-judge-3.md`. Merge remains blocked until a fresh builder, fresh deterministic checkrun, and fresh independent judge all pass.
