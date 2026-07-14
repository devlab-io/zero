# Checks niveau9 — gelés

Gel : tag `freeze/niveau9-v1`. Après ce tag, ces fichiers sont en lecture seule ; toute
modification d'un gate exige un RULING documenté sur la tracking issue AVANT le changement.
Un builder qui édite un fichier sous `docs/checks/` = FAIL automatique.

Normatifs pour ce run :

- Les 8 checks de ce dossier : `grading-rubric.md` (check maître — barème 10 axes + protocole
  juge froid), `structure.md`, `typecheck.md`, `tests.md`, `observability.md`, `data-config.md`,
  `ci-deploy.md`, `docs-governance.md`.
- Les 6 checks `docs/checks/niveau8/` (security, performance, robustness, keyboard-parity,
  agent-api, visual-qa), repris tels quels, inchangés, gelés à `freeze/niveau8-v1`.

Spec du run : `docs/spec/niveau9-architecture.md`. Manifest : `docs/runs/niveau9/manifest.md`.
