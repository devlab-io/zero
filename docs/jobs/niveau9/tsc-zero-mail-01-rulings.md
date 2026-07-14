# Rulings — niveau9/tsc-zero-mail-01 (issue #20) — append-only, orchestrateur

## RULING 2026-07-13 — PHASE 0 / concerns du rapport

- D1 ACCEPTÉ : couplage structurel vérifié — apps/mail importe AppRouter depuis
  @zero/server/trpc en source, donc tsc mail tire le graphe serveur entier.
  Sur les 72 erreurs résiduelles du worktree isolé : 0 locale à apps/mail,
  52 dans apps/server/src, 20 dans les packages DO de node_modules — sous-
  ensemble strict des 82 de la baseline serveur. La RUN « tsc mail = 0 » est
  donc jugée sur la branche REBASÉE sur factory/niveau9 après merge de #21
  (c5aef988), pas en isolation. Cohérent avec typecheck.md point 6 (flip
  après merge de V1.1 ET V1.2).
- D2 ACCEPTÉ : la séquence reproductible mail exige `react-router typegen`
  (génère aussi paraglide) AVANT le typecheck — absent de ci.yml et
  docs/testing.md, hors du may-touch de ce job. Intégré à l action de FLIP
  du typecheck (commit orchestrateur de sortie de vague 1), consigné ici.
- Réductions livrées : erreurs propres mail 16→0, any 79→23 (RULING R4 ≤25),
  @ts-nocheck 0, @ts-expect-error ajoutés 0, 3 bugs réels corrigés.
