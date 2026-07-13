# Frozen checks — niveau8

These checks were frozen before implementation. A PASS needs command output or browser evidence;
code inspection alone is insufficient when the check calls for runtime behavior.

| Check | Evidence |
|---|---|
| `keyboard-parity.md` | registry test, handler coverage test, browser keyboard run |
| `performance.md` | raw benchmark files, bundle/request budgets, Shortwave comparison |
| `robustness.md` | targeted tests and browser offline/error scenarios |
| `security.md` | auth/tool tests, audit report, secret scan, CI result |
| `agent-api.md` | MCP schema snapshots and Codex/Claude smoke run |
| `visual-qa.md` | desktop/mobile screenshots and accessibility smoke |

Freeze marker: `freeze/niveau8-v1`. Any later change to a gate requires a documented RULING on
issue #11 before implementation continues.

