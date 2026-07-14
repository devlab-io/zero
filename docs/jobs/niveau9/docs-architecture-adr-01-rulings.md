# Rulings — docs-architecture-adr-01 (issue #39)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch — digest de dette documentaire du run (2026-07-14)

Le job consomme la dette docs accumulée. Sources OPPOSABLES : les commentaires de
l'issue #13 (fan-ins par vague), les fichiers docs/jobs/niveau9/\*-rulings.md (chaîne
complète des décisions), les rapports de jobs. Dettes NOMMÉES à consommer :

1. ADRs existants : 0005 (sentry envelope), 0006 (trpc-type-boundary) — vérifier la
   numérotation, noter toute renumérotation nécessaire SANS renuméroter (note d'ADR).
2. Dette à STATUER par ADR/section : @zero/testing (décision V0 au rapport
   test-harness), @zero/cli, driver Microsoft (exception loc-ratchet couverte ADR).
3. Solutions à écrire (docs/solutions/) depuis les diagnoses du run : env-tsc-fantômes
   (worktree node_modules + séquence codegen obligatoire), prettier-vs-lockfile (hook
   reformate pnpm-lock → --no-verify + ensure_ascii=False), zsh-word-split (fichier
   parasite locales), autorisations-hors-canal (incident #44 : toute autorisation cite
   ID+source, confirmation canal factory), libellé-honnête (jurisprudence « jamais
   poids OK », formulation unique des gates), anti-metric-gaming (f143abf9 : la mesure
   statique ne vaut pas les octets réseau).
4. Known-issues à documenter : gen-trpc-boundary diverge du snapshot committé
   (vérification #40) ; guard statique agent-surface = denylist par nom (inhérent) ;
   fix commande gitleaks worktree (mode git + montage .git réel).
5. LICENSE-NOTES : inventaire par grep gelé, en-têtes préservés sur modules dérivés
   (workflow-_, sync-threads-_, routes/agent/\*), interdiction de redistribution,
   plan de sortie.
6. ARCHITECTURE.md : couches/flux/DO/frontières RÉELLES post-run (MailListData seam,
   projection DO, boundary tRPC, draft-outbox, logger, spa-fallback worker, lazy
   surfaces) — exact contre le code, le juge fera des spot-checks.
