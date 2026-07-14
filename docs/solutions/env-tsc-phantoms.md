# Solution — erreurs tsc « fantômes » en worktree neuf

**Symptôme.** Dans un worktree fraîchement créé, `tsc` remonte des dizaines d'erreurs qui
n'existent pas sur le checkout principal (types Cloudflare introuvables, routes React Router
inconnues, stubs i18n manquants). Les « erreurs » disparaissent sans qu'on touche au code.

**Diagnostic.** Deux causes, toujours les mêmes :

1. `node_modules` du worktree non installés (le worktree partage `.git` mais **pas** les deps).
2. Les types **générés** ne sont pas produits. `tsc` résout contre des fichiers qui n'existent que
   s'ils sont générés : `worker-configuration.d.ts` (`wrangler types`), les stubs de routes
   (`react-router typegen`) et les stubs paraglide i18n.

**Correctif — la séquence codegen obligatoire, dans cet ordre, avant tout typecheck :**

```bash
pnpm install --frozen-lockfile
pnpm --filter @zero/server types      # wrangler types --env local  → worker-configuration.d.ts
pnpm --filter @zero/mail types        # wrangler types (mail)
pnpm --filter @zero/mail exec react-router typegen   # routes + compile les stubs paraglide
```

C'est exactement l'ordre de l'étape 2 de la CI (`docs/testing.md` §CI). Les trois doivent tourner
**avant** `tsc` : ce sont les entrées contre lesquelles il résout.

**Prévention.** Ne jamais juger un compteur tsc sur un worktree sans avoir lancé la séquence. Un
compteur mesuré hors séquence n'est pas opposable (source : ruling docs §3, « env-tsc-fantômes »).
