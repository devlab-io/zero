# Re-certif perf v3 — staging, 2026-07-25 (après-midi)

_Suite de `perf-recertif-v2-2026-07-25.md`. Arbre : `perf/instant-thread`
`bfd07858`, déployé staging version `fa9c0edc`. Tests serveur 310/310,
typecheck propre. Toutes les valeurs ci-dessous sont MESURÉES ; les statuts
NON MESURÉ sont explicites._

## Ce qui a débloqué le run : l'instrument de C1 était mort

La ligne `trpc.call` posée hier (`6cd92d99`) vivait dans la branche
`if (loggingService)` de `trpc-logging.ts`, elle-même conditionnée à
`DD_API_KEY && DD_APP_KEY`. Vérifié sur les secrets déployés : ni l'une ni
l'autre n'existe, **ni en staging ni en production**. L'instrument de profilage
ne s'émettait donc nulle part. Rendu inconditionnel dans `ee706835`.

Second obstacle, de dépouillement : `wrangler tail --format json` n'émet pas du
JSONL mais des objets JSON indentés et concaténés — un parseur ligne à ligne
n'y voit rien. `scripts/perf/parse-tail.mjs` les recompose par comptage
d'accolades. C'est ce qui a rendu le profilage exploitable.

## Graphe statique du Worker : 24,5 → 11,25 Mio

Wrangler inline les `await import()` dans un unique `main.js` et ne produit
aucun chunk. **Vérifié en 4.114.0 en dry-run** : toujours un seul fichier,
aucune option de découpage dans la CLI ni dans le schéma de configuration.
L'hypothèse « upgrade wrangler = code splitting » du doc v2 est FAUSSE. Le
lazy-load agit sur l'évaluation, jamais sur le parse ; la seule voie était de
couper les arêtes.

| Geste                                                                                          | Commit     | Graphe    |
| ---------------------------------------------------------------------------------------------- | ---------- | --------- |
| Départ                                                                                         | `6cd92d99` | 24,5 Mio  |
| SDK Datadog → `fetch` sur l'intake (9,2 Mio, 37 % du total)                                    | `ee442671` | 15,4 Mio  |
| react-email retiré de `sanitize-tip-tap-html` ; barrels react-email et `effect` → sous-chemins | `36cdccc1` | 13,0 Mio  |
| SDK `cloudflare` → appel REST KV                                                               | `3a2d64d8` | 11,25 Mio |

Deux constats de fond derrière ces chiffres. `sanitize-tip-tap-html`, sur le
chemin d'ENVOI des messages, faisait tourner React, react-dom, prettier (deux
copies) et prismjs — 2,9 Mio — pour produire un doctype, une balise `html` et
un `div` ; remplacé par un gabarit littéral verrouillé par cinq tests. Et le
barrel `effect` réexporte `FastCheck`, donc `fast-check`, une bibliothèque de
property-testing, dans le bundle de production : esbuild ne la secoue pas, il
matérialise l'objet namespace du `export * as`.

## Axe 9 — démarrage et froid

| Métrique                                              | Avant                           | Après                   | Statut    |
| ----------------------------------------------------- | ------------------------------- | ----------------------- | --------- |
| Worker Startup Time (wrangler)                        | 925 ms → 575-632 ms (24/07)     | **234-264 ms**          | ✓         |
| 1er appel post-déploiement (isolate froid garanti)    | 1,13 s (déploiement `cb1d48e4`) | **720 ms** (`fa9c0edc`) | ✓         |
| Froid après longue inactivité, ancien code            | 1,66 s                          | —                       | référence |
| TTFB chaud, procédure publique                        | —                               | **16-21 ms**            | ✓         |
| Réseau seul (`/health`, DNS+TLS inclus, process neuf) | —                               | 54 ms                   | référence |

**Le froid isolate est provocable à la demande** : tout déploiement rend chaque
isolate froid. C'est le protocole de mesure retenu, contre l'affirmation du doc
v2 selon laquelle il ne l'était pas.

## Chemin chaud authentifié — capture d'une session réelle

Capture de 4 min, **192 requêtes** d'une session de Thomas sur staging déployé
`cb1d48e4`, dépouillée par `parse-tail.mjs`. Durées serveur, ms.

| Procédure                    | n   | p50       | p95   | max   |
| ---------------------------- | --- | --------- | ----- | ----- |
| `mail.openThread`            | 62  | **156**   | 779   | 3 032 |
| `mail.listThreads`           | 55  | **88**    | 107   | 157   |
| `mail.modifyLabels`          | 35  | 475       | 1 751 | 3 669 |
| `mail.verifyEmail`           | 29  | 944       | 4 211 | 4 795 |
| `brain.generateSummary`      | 23  | 225       | 1 957 | 1 963 |
| `mail.getMessageAttachments` | 20  | **3 413** | 4 195 | 4 209 |
| `mail.markAsRead`            | 16  | 599       | 2 990 | 3 021 |
| `bimi.getByEmail`            | 7   | 44        | 201   | 204   |
| `labels.list`                | 6   | 455       | 459   | 460   |
| `notes.list`                 | 5   | 652       | 659   | 660   |

Zéro erreur sur les 192 requêtes. CPU par requête : p50 14 ms, p95 122 ms.

### C2 et C4 : atteints

- **C2 — `listThreads` chaud < 500 ms** : p50 **88 ms**, p95 107 ms (contre
  0,8-2,2 s le 24/07). ✓
- **C4 — ouverture de fil < 1 s** : p50 **156 ms**, p95 779 ms. ✓ Le max à
  3,0 s reste à expliquer (probablement un fil absent du cache de corps, donc
  lecture R2 froide).

### Le verrou de l'axe 9 a changé de place

Ce ne sont plus la liste ni l'ouverture, mais trois procédures jamais auditées :
`getMessageAttachments` (3,4 s de médiane), `verifyEmail` (944 ms, 29 appels en
quatre minutes) et le couple `markAsRead`/`modifyLabels` (599 et 475 ms), qui
sont les deux gestes les plus fréquents de l'interface.

## Correctifs livrés sur cette base

`bfd07858`, déployé, **non re-mesuré sur le terrain** (les captures suivantes
n'ont produit ni `markAsRead` ni `modifyLabels`) :

- `modifyThreadLabelsInDB` passait par `getThread` — course sur tous les
  shards, lecture du corps complet dans R2, désérialisation — pour n'en retenir
  qu'un identifiant de shard. Marquer un message comme lu relisait tout le fil
  depuis le stockage objet. Remplacé par `locateThreadShard` à trois niveaux :
  shard mémorisé pour ce fil, sinon l'unique shard quand la topologie n'en
  compte qu'un, sinon une course sur la nouvelle sonde RPC `hasThread` qui
  n'interroge que la table `threads`.
- La propagation d'état qui suivait l'écriture (réveil ZeroAgent +
  `sendDoState`, deux allers DO attendus avant de répondre) passe en
  `waitUntil`.
- Verdicts DKIM/SPF mémorisés par message : le message brut est immuable, le
  verdict aussi. Les échecs ne sont pas mémorisés (test dédié).

Vague antérieure (`ee706835`), déployée et couverte par la capture ci-dessus :
mémoïsation par requête de `getActiveConnection` (le saut DO était payé une
fois par procédure d'un batch tRPC, sérialisées par le DO mono-thread) ;
`getZeroAgent` sorti du préambule de `listThreads` ; `doState` déplacé après le
cache et routé par `waitUntil` ; cache du HTML sanitisé ; `JSON.stringify` de
la sortie complète retiré du middleware de logging ; lecture R2 et requête
labels mises en parallèle ; cache des corps porté de 50 à 400 entrées.

## Reste à faire, par gain mesuré

1. **`getMessageAttachments`, 3,4 s de médiane** — pire poste absolu, jamais
   audité. Le résultat contient les pièces jointes elles-mêmes : un cache
   d'isolate exige un garde-fou de taille, à concevoir plutôt qu'à improviser.
2. **Re-mesurer `markAsRead` / `modifyLabels`** après `bfd07858` — nécessite du
   trafic authentifié produit par ces gestes précis.
3. **`notes.list` 652 ms, `labels.list` 455 ms** — de simples lectures de
   liste à plus de 0,4 s, non expliquées.
4. **C6 — INP** : NON MESURÉ. Nécessite une instrumentation côté client
   (extension Chrome connectée, ou script d'observation des event timings).
5. **C7 — durée de sync Gmail** : NON MESURÉ.
6. **Décision produit ouverte** : le SDK `dub` pèse 925 kio dans le bundle pour
   un plugin qui ne s'active que si `DUB_API_KEY` est défini — absent de
   staging ET de production. Idem pour tout le service Datadog, dont le
   contrat a été préservé mais qui n'est câblé nulle part.

## Outillage ajouté

- `scripts/perf/measure-auth.mjs` — mesure du chemin authentifié sans
  navigateur, par cookie de session (`.perf-cookie`, ignoré par git).
  **Non utilisé** : la capture `wrangler tail` d'une session réelle s'est
  révélée meilleure, et n'exige aucune manipulation de jeton.
- `scripts/perf/parse-tail.mjs` — dépouillement des captures tail, médianes par
  procédure. C'est l'outil qui a produit tous les chiffres du chemin chaud
  ci-dessus.
