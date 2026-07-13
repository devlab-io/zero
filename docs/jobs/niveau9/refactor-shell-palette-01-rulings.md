# Rulings — niveau9/refactor-shell-palette-01 (issue #28) — append-only, orchestrateur

## RULING 2026-07-13
- command-palette-views.tsx à 574 LOC (> cible 400, ≤ limite dure 800) :
  APPROUVÉ, même motif que #22/#26.
- Suppression des vues savedSearches/filterBuilder (~290 l.) : APPROUVÉE —
  mort prouvé (setters commentés uniques, 0 réf externe repo-wide, preuve au
  rapport §Code mort).
- Dédoublonnage HotkeyProviderWrapper : montage unique racine, convergent
  avec le lot zero-niveau8 (#32 héritera) — bindings inchangés.
- Contrat acté (consommé par #32) : lib/../command-registry.ts —
  PALETTE_COMMANDS (aliases+scope), PALETTE_TRIGGER_KEYS, FILTER_OPTIONS,
  types ; greffe niveau8 estimée +7 lignes.
- Note environnement : les « 147 erreurs » sur worktree neuf = types wrangler
  non générés (faux positifs connus) ; mesure valide = séquence complète.
- STATUS « DONE » lu comme COMPLETE (verdict au juge).
