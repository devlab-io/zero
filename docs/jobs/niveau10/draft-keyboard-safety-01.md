# Navigation clavier Brouillons — sécurité et parité

ISSUE: `#53`

BASELINE: `16cd726621fa3b55209c8eb7ad1068aeba259efc`

SCOPE: corriger le comportement `j/k` et Entrée dans le dossier Brouillons ; aucune modification
API, provider, base de données, OAuth, envoi ou déploiement

## Constat Computer Use

- `j`, `j`, `k` changeaient successivement `threadId` avec les identifiants de lignes Brouillons.
- Chaque déplacement déclenchait aussi `POST /api/trpc/mail.markAsRead`.
- Le provider refusait ensuite ces identifiants avec `Invalid id value`.
- Les lignes Brouillons n'exposaient aucun repère visuel pour le focus clavier.

## Correction

- La navigation de liste sépare désormais le déplacement du focus, l'ouverture et l'auto-read.
- Dans Brouillons, `j/k`, les flèches et les sauts de page déplacent seulement un focus local
  visible ; aucun lecteur de thread ni auto-read n'est déclenché.
- Entrée sur la ligne focalisée sélectionne le `draftId` et ouvre le composeur.
- Les lignes Brouillons exposent `data-thread-id` au moteur de scroll et un anneau de focus.
- Dans les dossiers normaux, l'ouverture sur déplacement est conservée, mais l'auto-read ne part
  que si le message est réellement non lu et que le réglage `autoRead` est actif.
- Tant que les réglages ne sont pas hydratés, l'auto-read reste fail-closed.
- Le repère de focus est présent sur une ligne chargée comme sur son skeleton.

## Preuves mécaniques séquentielles

### Suite complète

COMMAND: `pnpm test`

EXIT: `0`

```text
@zero/server:test: Test Files  27 passed (27)
@zero/server:test: Tests       324 passed (324)
@zero/mail:test:   Test Files  33 passed (33)
@zero/mail:test:   Tests       207 passed (207)
Tasks: 2 successful, 2 total
TOTAL: 531/531 tests
```

Les huit nouveaux scénarios couvrent le focus local Brouillons, le skeleton focalisé, l'ouverture
par Entrée, l'absence d'auto-read, le réglage fail-closed et la conservation du comportement normal
pour un thread non lu.

### Lint ciblé

EXIT: `0`

RESULT: `0` erreur, `5` warnings `react-hooks/exhaustive-deps` hérités dans les trois fichiers
existants touchés.

### Typecheck bloquant

COMMAND: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter
@zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node
scripts/checks/typecheck-report.mjs`

EXIT: `0`

RESULT: `server: 0 errors`, `mail: 0 errors`.

### Build mail

COMMAND: `pnpm --filter @zero/mail build`

EXIT: `0`

RESULT: build client et SSR vert, `0` erreur, `3` warnings Oxlint hérités.

### Format et hygiène

COMMAND: `pnpm exec prettier --check <8 fichiers> && git diff --check`

EXIT: `0`

Le premier run du worktree frais, lancé avant la génération Paraglide, n'est pas retenu comme
preuve. Après `react-router typegen`, toutes les preuves ci-dessus ont été rejouées
séquentiellement avec succès.

## Rejeu Computer Use après intégration

- Route initiale : `http://localhost:3001/mail/draft`, sans `threadId` ni composeur ouvert.
- `j`, `j`, `k` conservent exactement `/mail/draft` et déplacent le repère visuel de focus dans la
  liste.
- Une fenêtre de logs backend vidée juste avant le scénario ne contient aucun appel
  `/api/trpc/mail.markAsRead` et aucun appel d'envoi après la navigation.
- Entrée ouvre la ligne focalisée sur
  `/mail/draft?draftId=r-2047745557640053781&isComposeOpen=true` ; aucun `threadId` n'est créé.
- Le composeur expose bien destinataire, sujet et corps, puis Échap le referme sur `/mail/draft`.
- Une seconde fenêtre de logs backend ne contient ni `mail.markAsRead` ni `mail.send`.

RESULT: PASS — navigation Brouillons locale, visible et sans mutation fournisseur.

## Frontières conservées

- Aucun envoi ou suppression d'email.
- Aucun consentement OAuth Codex/Claude.
- Aucune migration ou écriture de base de données.
- Aucun déploiement.
- Aucun bouton d'envoi ou de suppression n'a été activé pendant le rejeu.

STATUS: COMPLETE
