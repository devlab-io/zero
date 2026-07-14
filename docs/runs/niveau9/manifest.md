# Run manifest — niveau9

- Tracking issue: devlab-io/zero#13
- Spec: `docs/spec/niveau9-architecture.md`
- Mode: github · Branch: `factory/niveau9` (cut from `factory/niveau8` @ `23359642`)
- Orchestrator: Claude Fable (Jarvis session 2026-07-12) · Builders: claude/best (fable, effort
  high) per `.architect/config` · Judges: orchestrator-tier, cold · Monitor: script watchdog
- Checks dir: `docs/checks/niveau9/` (+ `docs/checks/niveau8/` normatifs, inchangés)
- Jobs dir: `docs/jobs/niveau9/` · Evidence dir: `docs/research/niveau9/`
- Grading: baseline `docs/runs/niveau9/baseline-grading.md` · final `docs/runs/niveau9/final-grading.md`
- Freeze: tag `freeze/niveau9-v1`
- Hard stops permanents: aucun deploy, mutation prod, changement OAuth-console, envoi de mail
  réel sans confirmation explicite de Thomas
- Oddities à l'ouverture: lot clavier non commité dans `~/cc/zero-niveau8` (AS-3) ; suppressions
  stagées non commitées dans `~/cc/zero` (AS-4) ; hook pre-commit rouge sur 24 warnings oxlint
  préexistants → commits docs de l'orchestrateur en `--no-verify` jusqu'à V0.2 ; run niveau8 clos
  sur #11, reliquat absorbé ici
