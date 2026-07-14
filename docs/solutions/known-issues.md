# Known issues — dette technique constatée et tracée (run niveau9)

Trois limitations connues, documentées pour ne pas être re-diagnostiquées à chaque fois. Aucune n'est
bloquante ; chacune a un contournement ou une raison assumée.

## 1. `gen-trpc-boundary` peut diverger du snapshot committé

- **Constat (vérification #40).** Le snapshot de frontière tRPC committé
  (`apps/server/src/trpc/app-router.boundary.d.ts`) peut diverger de ce que régénère
  `apps/server/scripts/gen-trpc-boundary.mjs` si le routeur change sans régénération.
- **Contournement.** Régénérer et committer après tout changement de routeur :
  `pnpm --filter @zero/server gen:trpc-boundary`, puis vérifier le diff. Voir ADR
  `0006-trpc-type-boundary.md`.
- **Statut.** Dette assumée : le snapshot est une frontière **manuelle** (committée), pas un artefact
  de build ; c'est le prix de la portabilité des types mail↔server.

## 2. Le guard `check-agent-surface` est une denylist par nom (limite inhérente)

- **Constat.** `scripts/security/check-agent-surface.mjs` contrôle la surface d'outils de l'agent /
  OAuth via une **denylist par nom**. Un outil renommé, ou ajouté sous un nom non listé, n'est pas
  attrapé automatiquement.
- **Raison.** Une allowlist statique exhaustive sur une surface qui évolue vite serait plus fragile ;
  la denylist cible les capacités sensibles connues.
- **Statut.** Limite **inhérente** au mécanisme, pas un bug. Toute nouvelle capacité sensible doit
  être ajoutée à la denylist en même temps qu'elle est introduite.

## 3. `gitleaks` en worktree : mode git + montage du vrai `.git`

- **Constat.** Lancer `gitleaks` (image épinglée `ghcr.io/gitleaks/gitleaks:v8.30.1`, config
  `scripts/checks/gitleaks.toml`) en **mode `git`** depuis un worktree échoue : un worktree a un
  **`.git` fichier** (pointeur `gitdir:`), pas un répertoire — le scanner ne trouve pas l'historique.
- **Contournement.** Soit utiliser le mode `dir` (comme la CI — `docs/testing.md` §CI pt 10), soit,
  pour le mode `git`, monter le **vrai** répertoire `.git` du dépôt principal (résoudre le pointeur
  `gitdir:` du worktree) dans le conteneur.
- **Statut.** Contournement connu ; la CI utilise déjà le mode `dir` qui n'est pas concerné.

---

Sources : ruling `docs/jobs/niveau9/docs-architecture-adr-01-rulings.md` §4 ; vérification #40 ;
`docs/testing.md` §CI.
