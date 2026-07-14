# MCP `createDraft` live — Claude vers Zero

BASELINE: `ec3e5bffb4f753d818214e93c38b436b94a15715`

SCOPE: vérifier la création bornée d'un brouillon autonome depuis Claude, corriger le contrat MCP
exposé aux clients et contrôler le résultat dans Zero sans envoi, suppression ou écriture Queue.

## Défaut découvert en live

Le premier appel Claude à `createDraft` a échoué avant toute écriture. Le SDK MCP publiait le
schéma raffiné Zod de `createDraft` comme un objet vide (`properties: {}`). Claude ne recevait donc
pas le type tableau de `to` et sérialisait le destinataire comme une chaîne ; le serveur refusait
correctement l'entrée avec `Expected array, received string`.

La même faiblesse latente concernait `composeEmail` : les deux schémas utilisent `superRefine`,
alors que la normalisation `tools/list` du SDK attend une forme objet Zod brute.

## Correction

- L'enregistrement SDK utilise désormais les formes Zod brutes de `composeEmail` et
  `createDraft`, qui produisent un JSON Schema complet et typé.
- Les handlers reparsent immédiatement les entrées avec les schémas raffinés existants. Les
  limites multi-destinataires et la politique de consentement Web restent donc appliquées côté
  serveur.
- Un test de régression passe chaque forme d'enregistrement par la normalisation réelle du SDK et
  vérifie que `createDraft.to` reste un tableau d'objets, avec `subject`, `message` et
  `idempotencyKey` exposés.

## Preuves mécaniques

- Suite complète : serveur `326/326`, interface mail `207/207`, total `533/533`.
- Typecheck serveur : `0` erreur.
- ESLint ciblé sur les trois fichiers touchés : `0` erreur.
- Prettier ciblé et `git diff --check` : verts.
- Contrôle de surface agent : `Security surface check passed: least scopes, bounded session cache,
draft-only MCP.`
- Le lint serveur global a atteint la limite mémoire Node de 4 Go ; le lint ciblé avec une limite
  explicite de 8 Go est vert.

## Preuve live

- Claude est connecté au serveur `zero` local et a appelé exactement une fois `createDraft`, puis
  `getDraft`, avec la clé d'idempotence `qa-omar-claude-20260714-v1`.
- Brouillon créé : `r8142370612105721524`.
- Destinataire : `omar@devlab.io`.
- Objet : `TEST QA — génération Zero depuis Claude`.
- Le corps indique explicitement qu'il s'agit d'un brouillon de test et que le message n'a pas été
  envoyé.
- Computer Use ouvre directement
  `/mail/draft?draftId=r8142370612105721524&isComposeOpen=true`, retrouve le destinataire, l'objet
  et le corps, puis referme le composeur avec Échap.
- Après fermeture, la ligne apparaît en tête de Drafts à `10:23 AM`.
- Contrôle final : `/queue` affiche `0 pending review`, tous les statuts restent à `0` et
  `No draft jobs in this status`; le compteur Queue `Sent` reste à `0`.
- Les logs live montrent uniquement les lectures UI et les échanges MCP ; aucun appel de route
  d'envoi n'apparaît.

## État clients

- `claude mcp get zero` : `Connected`.
- `codex mcp get zero` : serveur activé, transport Streamable HTTP, `getDraft` autorisé et mode
  d'approbation `writes`.
- La réauthentification Codex a terminé avec succès. Une relecture dans un sous-processus Codex n'a
  toutefois pas atteint `getDraft`, car le démarrage global charge aussi d'autres connecteurs dont
  des jetons OAuth sont expirés. Le processus bloqué a été arrêté sans mutation.

## Frontières

- Aucun email envoyé, planifié ou supprimé.
- Aucun bouton `Send`, `Send later` ou `Delete draft` activé.
- Aucun item Queue créé ou approuvé.
- Aucun déploiement ni écriture de base distante.

STATUS: COMPLETE — CLAUDE CREATE/READ + ZERO COMPUTER USE PASS
