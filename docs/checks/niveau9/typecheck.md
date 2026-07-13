# Check — dette de types à zéro (V1.1 tsc-zero-mail, V1.2 tsc-zero-server)

1. **Génération préalable** : les types wrangler sont régénérés de façon reproductible
   (`pnpm --filter <app> exec wrangler types` ou script équivalent documenté) ; la procédure est
   écrite dans le README ou docs/testing.md.
2. **Zéro erreur** : `tsc --noEmit` = 0 erreur sur l'app cible, sortie complète conservée dans le
   rapport de job.
3. **Pas de triche** : aucun affaiblissement de tsconfig (strict reste true, aucun flag retiré,
   aucun dossier exclu ajouté) ; 0 nouveau `@ts-nocheck` ; tout `@ts-expect-error` ajouté est
   budgété par RULING sur l'issue, avec justification par site.
4. **Comportement inchangé** : corrections de types uniquement — tout changement de logique
   nécessaire (bug de type révélant un bug réel) est listé explicitement dans le rapport avec
   diff pointé ; les tests passent.
5. **Ratchet** : `scripts/checks/type-ratchet` (V0.2) publie les compteurs (erreurs tsc, any,
   as any, assertions, ts-expect-error) ; les compteurs de l'app traitée sont à leur cible
   (erreurs = 0) et le ratchet global n'a augmenté nulle part.
6. **Flip CI** (critère de sortie de vague 1, action orchestrateur) : après merge de V1.1 ET
   V1.2, l'étape typecheck de ci.yml passe de rapport à bloquante ; preuve : run CI vert avec
   l'étape en mode bloquant.
