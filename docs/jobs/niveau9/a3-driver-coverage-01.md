# Job — a3-driver-coverage-01 (vague V7 « niveau réel »)

Cible : le manquant A3 du jugement final (−0,5) — `lib/driver` à 13,4 % lignes < 50 %.
Tests unitaires RÉELS des modules Google CRUD via la couture transport existante. AUCUN
push (vague locale). Worktree : `job/niveau9/a3-driver-coverage-01`, HEAD gelé
`375d1003b2f86ba53b28b5ef6e7b2d48c75fb320`.

## PHASE 0 — arithmétique de couverture (MESURÉE, pas estimée)

Baseline mesurée sur le HEAD gelé (`vitest run src/lib/driver --coverage --coverage.provider=v8
--coverage.include='src/lib/driver/**'`, tests driver préexistants uniquement) :

| Fichier | Lignes | Couvertes | % |
|---|---:|---:|---:|
| gmail-backoff.ts | 98 | 94 | 95,91 |
| gmail-batch.ts | 152 | 147 | 96,71 |
| gmail-sync-persist.ts | 11 | 11 | 100 |
| google-transport.ts | 179 | 162 | 90,50 |
| google-account.ts | 73 | 0 | 0 |
| google-drafts.ts | 289 | 0 | 0 |
| google-label-color-map.ts | 37 | 0 | 0 |
| google-labels.ts | 273 | 0 | 0 |
| google-messages.ts | 113 | 0 | 0 |
| google-parse.ts | 265 | 0 | 0 |
| google-threads.ts | 314 | 0 | 0 |
| google.ts | 121 | 0 | 0 |
| index.ts | 14 | 0 | 0 |
| types.ts | 12 | 0 | 0 |
| **microsoft.ts (gelé, may-not-touch)** | **1070** | **0** | **0** |
| **DOSSIER driver** | **3089** | **414** | **13,40** |

Calcul du seuil 50 % :
- Lignes à couvrir pour 50 % du dossier = ⌈0,5 × 3089⌉ = **1545** (baseline 414) → **déficit 1131 lignes**.
- microsoft.ts = 1070 lignes à 0 %, GELÉ (may-touch INTERDIT en écriture). S'il reste à 0 %,
  plafond théorique du dossier = (3089 − 1070) / 3089 = **65,36 %**.
- Non-microsoft : 2019 lignes, 414 couvertes (20,51 %) → 1605 lignes non-ms restantes.

**Verdict PHASE 0 : le seuil 50 % EST atteignable SANS toucher microsoft.ts** — il faut couvrir
1131 des 1605 lignes non-ms restantes (≈ 70,5 %), soit porter le groupe non-microsoft de 20,51 %
à ≥ 76,5 %. Tendu mais réaliste : les modules CRUD sont hautement testables via la couture
transport (injection par constructeur, `execute(fn)` traversant le vrai pipeline).

**Stratégie microsoft.ts (désaccord attendu, statué honnêtement).** microsoft.ts
(`OutlookMailManager`) construit son `graphClient` DANS le constructeur (`Client.init`), sans
aucun point d'injection ; toutes les méthodes appellent `this.graphClient.api(...)` (réseau).
Étant may-touch INTERDIT, on NE PEUT PAS y ajouter de couture. Des tests de comportement réel y
sont donc IMPOSSIBLES sans le modifier. Il reste à 0 % ; couvrir `getScope`/`normalizeIds`
(~15 lignes) serait de la chasse cosmétique (interdite par le ruling V7). **Libellé honnête :
dossier plafonné à 65,36 % tant que microsoft.ts est gelé ; le seuil 50 % est franchi par le seul
périmètre Google.**

## Reproduction de la mesure (échafaudage, hors diff git)

Prérequis (worktree non peuplé) — `node_modules` gitignoré, lockfile/config INTOUCHÉS :
```
pnpm install --frozen-lockfile --ignore-scripts --offline   # store global chaud
```
`@vitest/coverage-v8@3.2.7` est une devDependency DURABLE du lockfile gelé (fix #37) :
`require.resolve('@vitest/coverage-v8')` RÉUSSIT après install — aucun symlink #35 nécessaire.
```
cd apps/server && pnpm exec vitest run src/lib/driver --coverage --coverage.provider=v8 \
  --coverage.include='src/lib/driver/**' --coverage.reporter=text
```

## Inventaire (fichier → tests → ce qui est prouvé)

- **google-label-color-map.test.ts** (8) — mapping bidirectionnel couleurs Gmail⇄interne :
  gardes (undefined/incomplet), clé connue→mappée, clé inconnue→identité, round-trip réciproque.
- **driver-utils.test.ts** (15) — `fromBase64Url` (remap −_→+/), `fromBinary` (round-trip UTF-8+emoji),
  `findHtmlBody` (récursif + log), `getSimpleLoginSender`, `sanitizeContext` (redaction),
  `StandardizedError` (message/code/défauts), `FatalErrors`, `deleteActiveConnection` (branche null).
- **google-parse.test.ts** (23) — `parseMessage` (en-têtes complets, SimpleLogin prioritaire, TLS
  Received/TLS-Report, repli Failed/(no subject)/ERROR, Cc vide vs absent), `findAttachments`
  (inline+Content-ID exclus, inline sans CID inclus, récursion, message/rfc822), `parseOutgoing`
  (dédup destinataires, extraction <>, rejets, cc/bcc excluant l'expéditeur, References normalisées,
  PJ base64/arrayBuffer, images inline, message original).
- **google-messages.test.ts** (9) — `getAttachment` (retry, remap, data absente, erreur),
  `getMessageAttachments` (métadonnées + corps batché ordonné, filtrage sans attachmentId, sans parts),
  `create` (parseOutgoing+send raw/threadId), `delete`, `getRawEmail` (décodage + « No raw email data found »).
- **google-threads.test.ts** (21) — `normalizeSearch` (6 dossiers), `list` (mapping, filtre id non-string,
  labelIds inbox vs non-inbox, pageToken), `get`/`parseThread` (unread, totalReplies hors draft, latest,
  labels agrégés, PJ métadonnée corps-vide, images inline cid:→dataURI + échec toléré, fil vide),
  `getMany` (batch), `markAsRead`/`markAsUnread` (collect par UNREAD), `normalizeIds`, `deleteAllSpam`
  (pagination→TRASH), `listHistory` (+ erreur).
- **google-drafts.test.ts** (12) — `sendDraft`, `deleteDraft` (quotaUser), `getDraft`/`parseDraft`
  (complet parts, body.data seul, « Draft not found », « Failed to parse draft », PJ échouée exclue),
  `listDrafts` (get par brouillon, tri date desc, null filtrés), `createDraft` (create vs update,
  raw URL-safe, PJ base64/arrayBuffer + images inline).
- **google-labels.test.ts** (14) — `count` (agrégation Effect labels+archive, sent/drafts=total sinon
  unread, échec liste→rejet [sémantique Effect réelle], labels vides→[]), `getUserLabels`/`getLabel`
  (mapping couleurs, null→''), `create`/`update`/`deleteLabel`, `modifyThreadLabels` (vide, multi-chunks
  >15, échec→rejet fil), `modifyLabels` (labels système, création+résolution nouvel id).
- **google-account.test.ts** (8) — `getTokens`, `getUserInfo` (People mocké), `getEmailAliases`
  (primaire + sendAs, exclusion doublon), `revokeToken` (succès/vide/échec+log).

**Anti-tautologie (jurisprudence #35).** 12 assertions ont d'abord ÉCHOUÉ en révélant le comportement
RÉEL (FALLBACK_SENDER, `fromBase64Url`≠décodage, Cc espaces→[], et surtout deux branches Effect
INATTEIGNABLES dans `google-labels` : `count` rejette au lieu de retourner [] sur échec liste, et
`modifyThreadLabels` rejette avec l'objet d'échec du fil au lieu du message d'agrégation). Les tests
ont été alignés sur le RÉEL — chacun peut échouer si le code change.

## Couverture APRÈS (verbatim `--coverage.reporter=text`)

```
 driver            |   58.69 |    84.64 |   94.53 |   58.69 |
  gmail-backoff.ts |   95.91 |    81.13 |   85.71 |   95.91 |
  gmail-batch.ts   |   96.71 |    87.03 |     100 |   96.71 |
  gmail-sync-persist.ts | 100 |     100 |     100 |     100 |
  google-account.ts|     100 |    88.88 |     100 |     100 |
  google-drafts.ts |    99.3 |    80.76 |     100 |    99.3 |
  google-label-color-map.ts | 100 | 88.88 |    100 |     100 |
  google-labels.ts |   94.13 |    72.82 |    90.9 |   94.13 |
  google-messages.ts |   100 |    79.41 |     100 |     100 |
  google-parse.ts  |   98.86 |     94.2 |     100 |   98.86 |
  google-threads.ts|   99.36 |    84.76 |     100 |   99.36 |
  google-transport.ts | 90.5 |    83.33 |   83.33 |    90.5 |
  google.ts        |       0 |     100 |     100 |       0 |
  index.ts         |       0 |     100 |     100 |       0 |
  microsoft.ts     |       0 |       0 |       0 |       0 |
  types.ts         |       0 |     100 |     100 |       0 |
  utils.ts         |   85.29 |    95.83 |     100 |   85.29 |
```

**Résultat : dossier `driver` 13,40 % → 58,69 % lignes (1813/3089, +1399 couvertes), marge +268 au-dessus
du seuil 50 %.** Le manquant A3 (−0,5) est résolu. Non couverts et POURQUOI (libellé honnête) :
`microsoft.ts` (0 %, gelé, aucune couture d'injection — voir PHASE 0), `google.ts`/`index.ts`
(délégation pure de façade / ré-exports — tests de câblage à faible valeur réelle, écartés pour ne pas
padder), `types.ts` (déclarations de types, ~0 ligne exécutable).

## Gates

- **tsc server = 0** (après `pnpm --filter @zero/server run types`).
- **vitest ×2 déterministe** : 168/168 (driver) identiques sur 2 runs.
- **suite serveur complète** : 298/298 (23 fichiers) — aucune régression.
- **coverage** : mesurée avant (13,40 %) / après (58,69 %), `@vitest/coverage-v8@3.2.7` résolu nativement.
- **RC natifs** : suite complète verte (better-sqlite3 & co résolus).

## MIRROR: ORCHESTRATOR

- Couture manquante à remonter (HORS périmètre — code produit, may-not-touch) : **microsoft.ts n'a
  aucun point d'injection** (`graphClient` construit en constructeur). Pour le rendre testable en
  comportement réel — et lever le plafond de 65,36 % du dossier — il faudrait injecter le `Client`
  Graph par constructeur (aligné sur la couture `GmailTransport` du côté Google). Décision propriétaire.
- Deux branches MORTES relevées dans `google-labels.ts` (sémantique Effect) : `count` (`return []` sur
  `LabelListFailed` inatteignable) et `modifyThreadLabels` (message d'agrégation « Failed to modify
  labels » inatteignable car `Effect.all` court-circuite). Non corrigées (code produit hors périmètre) ;
  signalées pour un futur job de robustesse.

## STATUS

DONE — seuil 50 % franchi (58,69 %), gates verts, boundaries respectées (8 tests + 1 fixture NOUVEAUX,
aucun code produit/config/lockfile touché). Aucun commit, aucun push (vague locale). STAND-DOWN.
