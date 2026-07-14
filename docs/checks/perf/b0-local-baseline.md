# Frozen checks — perf / b0-local-baseline

Executor: bash
Spec pointer: docs/spec/perf-baseline.md
Run: perf · Slice: b0-local-baseline
Rule: any builder edit under docs/checks/ is an automatic FAIL.

## Runnable checks

- RUN: `test -f docs/research/perf-baseline.md && echo REPORT_OK` -> expected output `REPORT_OK`
- RUN: `grep -c "## B0" docs/research/perf-baseline.md` -> expected output >= 1 (B0 section present)
- RUN: `grep -cEi "LCP|TBT|CLS" docs/research/perf-baseline.md` -> expected output >= 3 (core metrics reported)
- RUN: `grep -cEi "médiane|median" docs/research/perf-baseline.md` -> expected output >= 1 (3-run median methodology applied)
- RUN: `grep -cEi "goulot|bottleneck|non concluant|inconclusive" docs/research/perf-baseline.md` -> expected output >= 1 (a conclusion is stated, even if partial)
- RUN: `git status --porcelain -- apps packages | wc -l` -> expected output `0` (measurement job, zero code changes)

## Judge-only checks (orchestrator-graded if judged same-family)

- Each metric: ≥3 runs, median retained, conditions recorded (machine, date,
  cache state, build command).
- The report distinguishes B0's validity limits (local serve ≠ CF edge; auth
  state clearly stated) and names what only B1 can answer.
- No secret value appears anywhere in the report or logs.
