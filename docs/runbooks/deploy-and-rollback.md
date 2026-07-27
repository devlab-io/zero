# Runbook — déployer et revenir en arrière

Écrit pendant le run pitbull (axe 10 : production readiness). Les commandes ci-dessous ont été
vérifiées sur l'arbre du 2026-07-26 ; celles qui déploient réellement n'ont **pas** été exécutées.

## Ce qui déploie, en vérité

Le chemin nominal ne passe pas par une commande locale.

1. Le travail atterrit sur `staging` par PR. La CI `quality-and-security` doit être verte.
2. Sur une PR portant le label `production-deploy`, un membre commente `/deploy`.
3. `.github/workflows/deploy-to-prod-command.yml` **refuse** si la CI n'est pas verte sur le
   `staging` courant, puis rebase `main` sur `staging` et pousse `main` en force-with-lease.
4. La build Cloudflare rattachée à `main` construit et déploie les Workers.

Autrement dit : **`main` est l'artefact de production**. Rien d'autre ne le met à jour.

## Noms de Workers

| Environnement | Serveur                  | Front             |
| ------------- | ------------------------ | ----------------- |
| local         | `zero-server-local`      | `zero-local`      |
| staging       | `zero-server-staging`    | `zero-staging`    |
| production    | `zero-server-production` | `zero-production` |

Les noms d'environnement sont hérités du nom racine (`zero-server`, `zero`) suffixé par l'env :
les blocs `env.*` de `wrangler.jsonc` ne redéfinissent pas `name` côté serveur.

## Déploiement manuel (sortie de secours)

```bash
pnpm deploy:staging      # serveur puis front, sur staging
pnpm deploy:production   # serveur puis front, sur production
```

Ces commandes n'existaient pas avant le 2026-07-26. Ce qui existait — `pnpm deploy:backend` et
`pnpm deploy:frontend` — lançait `wrangler deploy` **sans `--env`**, ce qui avait deux
conséquences que personne ne voyait :

- côté serveur, la commande **échouait au build** (`No loader is configured for ".sql" files`),
  parce que les règles de chargement des `.sql` sont déclarées dans les blocs `env.*` et non à la
  racine de `wrangler.jsonc` ;
- côté front, elle **réussissait** — et déployait le Worker racine `zero`, c'est-à-dire ni
  `zero-staging` ni `zero-production`.

Les deux commandes historiques échouent désormais avec un message qui renvoie ici.

## Revenir en arrière

Cloudflare conserve les versions déployées de chaque Worker. Le retour arrière se fait **par
Worker**, il n'est pas global.

```bash
# lister les versions récentes
pnpm --filter @zero/server exec wrangler versions list --env production
pnpm --filter @zero/mail  exec wrangler versions list --env production

# revenir à la version précédente (interactif : demande confirmation)
pnpm --filter @zero/server exec wrangler rollback --env production
pnpm --filter @zero/mail  exec wrangler rollback --env production

# ou cibler une version précise
pnpm --filter @zero/server exec wrangler versions deploy <version-id>@100% --env production
```

`wrangler rollback` est disponible dans la version épinglée du dépôt (wrangler 4.32.0, vérifié).

### Le code revient, la base ne revient pas

Les migrations drizzle de ce dépôt **n'ont pas de `down`**. Un rollback de Worker ramène donc du
code ancien face à un schéma neuf. En pratique :

- un rollback est sûr tant que le déploiement fautif n'a **pas** appliqué de migration ;
- si une migration est passée, il faut écrire le correctif en avant (roll-forward), ou préparer à
  la main l'inverse de la migration incriminée avant de revenir en arrière ;
- appliquer les migrations **avant** le code reste la règle : un code neuf face à un schéma
  ancien casse, l'inverse tient le temps du rollback.

### Retour arrière côté git

`main` étant l'artefact, revenir en arrière côté source se fait en repoussant `main` sur le commit
sain (`git push --force-with-lease origin <sha>:main`), ce qui redéclenche une build Cloudflare.
Cette voie est plus lente que `wrangler rollback` — l'utiliser pour figer l'état, pas pour
éteindre l'incident.

## Ce qui manque encore (non traité ici)

- **Les migrations ne sont appliquées par aucune étape du déploiement.** Ni la CI ni le workflow
  `/deploy` n'exécutent `drizzle-kit migrate` : c'est un geste manuel non tracé.
- **Aucune version n'est étiquetée.** Rien ne relie une version de Worker Cloudflare à un SHA git
  autrement que par l'horodatage.
- **Aucune supervision externe n'interroge les sondes.** `/health` (vivacité, 200 en dur, ne
  touche aucune dépendance à dessein) et `/health/ready` (lecture réelle base + KV, bornée à
  2 s, 503 si une dépendance est à terre) existent depuis le 2026-07-26 — mais rien ne les
  appelle. Brancher `/health/ready` sur une sonde externe reste à faire.
