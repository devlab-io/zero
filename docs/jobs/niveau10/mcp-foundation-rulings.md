# MCP foundation rulings

## 2026-07-14 — Untracked report path precision

- The builder reached 28/28 focused tests, the draft-only security guard, focused lint, and server type generation plus typecheck before the frozen touch-set command failed.
- Plain `git status --porcelain` collapsed the new untracked report to `docs/jobs/niveau10/`, even though the check authorised `docs/jobs/niveau10/mcp-foundation-01.md`.
- The corrected command requests `--untracked-files=all`. This is a check-contract correction only; it does not widen the product MAY TOUCH boundary or acceptance criteria.
- A fresh builder must rerun every corrected frozen command and update `docs/jobs/niveau10/mcp-foundation-01.md`; the blocked report is not accepted on its own.
