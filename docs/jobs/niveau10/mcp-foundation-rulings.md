# MCP foundation rulings

## 2026-07-14 — Untracked report path precision

- The builder reached 28/28 focused tests, the draft-only security guard, focused lint, and server type generation plus typecheck before the frozen touch-set command failed.
- Plain `git status --porcelain` collapsed the new untracked report to `docs/jobs/niveau10/`, even though the check authorised `docs/jobs/niveau10/mcp-foundation-01.md`.
- The corrected command requests `--untracked-files=all`. This is a check-contract correction only; it does not widen the product MAY TOUCH boundary or acceptance criteria.
- A fresh builder must rerun every corrected frozen command and update `docs/jobs/niveau10/mcp-foundation-01.md`; the blocked report is not accepted on its own.

## 2026-07-14 — Judge 1 FAIL: contextual recipient aggregate

- Independent judge 1 returned `Slice verdict: FAIL` even though every frozen RUN passed, including 28/28 focused tests and the security guard.
- `composeEmailInputSchema` caps the top-level `to + cc` total at 50, but each `threadMessages` item independently permits 50 `to` plus 50 `cc`. A contextual message with 100 recipients therefore passes validation.
- The frozen contract requires every recipient-bearing payload to reject more than 50 total recipients before any driver call. The correction must enforce the combined `to + cc` limit for each contextual message and add an observable pre-driver regression test.
- No other acceptance criterion or MAY TOUCH boundary is widened. The orchestrator cannot merge until a fresh builder, fresh checkrun, and fresh independent judge all pass.
