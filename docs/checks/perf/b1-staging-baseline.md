# Frozen checks — perf / b1-staging-baseline

Executor: bash
Spec pointer: docs/spec/perf-baseline.md
Run: perf · Slice: b1-staging-baseline
Rule: any builder edit under docs/checks/ is an automatic FAIL.
Cible mesurée : https://zero-staging.devlab-tahiti.workers.dev (front) +
https://zero-server-staging.devlab-tahiti.workers.dev (API), depuis Tahiti.

## Runnable checks

- RUN: `grep -c "## B1" docs/research/perf-baseline.md` -> expected output >= 1 (B1 section added to the existing report)
- RUN: `grep -cEi "LCP|TBT|CLS" docs/research/perf-baseline.md` -> expected output >= 6 (B0 + B1 metrics both present)
- RUN: `grep -ci "hyperdrive" docs/research/perf-baseline.md` -> expected output >= 1 (cold/warm API latency measured or explicitly BLOCKED)
- RUN: `grep -cEi "sync initiale|initial sync" docs/research/perf-baseline.md` -> expected output >= 1 (sync latency reported from DB/log evidence or explicitly BLOCKED)
- RUN: `grep -cEi "goulot|bottleneck" docs/research/perf-baseline.md` -> expected output >= 2 (B1 conclusion ranks the bottleneck vs B0)
- RUN: `grep -cEi "P[1-6]" docs/research/perf-baseline.md` -> expected output >= 1 (recommendation maps onto the P1-P6 candidate issues)
- RUN: `git status --porcelain -- apps packages | wc -l` -> expected output `0` (measurement job, zero code changes)

## Judge-only checks (orchestrator-graded)

- Each metric: ≥3 runs, median, conditions recorded (date/heure Tahiti, réseau).
- Unauthenticated scope honnête : landing/login mesurés ; parcours authentifié
  soit mesuré avec preuve, soit marqué BLOCKED avec la raison exacte.
- API latency: cold vs warm distingués (première requête après idle vs suivantes).
- Aucun secret, aucun cookie de session copié dans le rapport.
- La conclusion ordonne P1-P6 par impact attendu, chiffres à l'appui.
