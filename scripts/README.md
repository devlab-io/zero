# Scripts

Utilitaires hors flux applicatif (développement, maintenance). Le lanceur est
[cmd-ts](https://github.com/Schniz/cmd-ts) : arguments typés, aide générée, sous-commandes.

## Lancer un script

Depuis la racine du dépôt :

```bash
pnpm scripts <sous-commande> [options]
pnpm scripts --help            # liste les sous-commandes disponibles
```

La commande racine est définie dans le `package.json` de la racine :

```json
"scripts": "dotenv -- pnpx tsx ./scripts/run.ts"
```

> Ce dossier porte son propre `package.json` (`cmd-ts`, `resend`, `@faker-js/faker`,
> `@inquirer/prompts`). Il doit être membre du workspace pour que ces dépendances soient
> installées — `pnpm-workspace.yaml` déclare désormais `scripts` **et** `scripts/*`. Sans la
> première ligne, `pnpm scripts` échouait en `ERR_MODULE_NOT_FOUND` (corrigé le 2026-07-26).

## Sous-commandes enregistrées

Une seule est active, dans `scripts/run.ts` :

### `send-emails`

Envoie des emails de test via Resend. Requiert `RESEND_API_KEY` dans l'environnement (chargé
par `dotenv` depuis le `.env` racine).

```bash
pnpm scripts send-emails --help
```

### `seed-style` — désactivée

La sous-commande existe sur le disque (`scripts/seed-style/`) mais elle est **commentée** dans
`scripts/run.ts`, donc non enregistrée : `pnpm scripts seed-style` ne fonctionne pas. Ses
fichiers de données (`scripts/seed-style/styles/*.json`) sont par ailleurs les deux fichiers qui
font échouer `pnpm check:format`. À réactiver ou à supprimer — la décision n'est pas prise.

## Ajouter un script

1. Créer un dossier sous `scripts/` avec un module exportant une commande `cmd-ts`.
2. L'enregistrer dans la table `cmds` de `scripts/run.ts`.
3. Documenter la sous-commande ici, avec ses variables d'environnement requises.
