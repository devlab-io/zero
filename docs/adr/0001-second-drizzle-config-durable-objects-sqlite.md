# ADR 0001 — Deuxième configuration Drizzle : SQLite des Durable Objects (agent) maintenue isolée

- **Statut :** Accepté
- **Date :** 2026-07-12
- **Périmètre :** `apps/server/` — coexistence de deux configurations Drizzle
- **Issue :** devlab-io/zero#19 (niveau9, V1.4 migrations-repair), check `docs/checks/niveau9/data-config.md` point 4
- **Lié à :** `docs/solutions/migrations-drift.md`

## Contexte

Le serveur héberge **deux** configurations Drizzle, distinctes par leur moteur, leur runtime,
leur cycle de vie et leurs données :

### Config A — base applicative principale (Postgres)

- Fichier : `apps/server/drizzle.config.ts`
- `dialect: 'postgresql'`, `out: './src/db/migrations'`, `schema: './src/db/schema.ts'`,
  `tablesFilter: ['mail0_*']`, `dbCredentials.url = process.env.DATABASE_URL`.
- Base **centrale, partagée**, tables `mail0_*` (comptes, connexions, sessions, réglages…).
- Migrations générées/appliquées via drizzle-kit (`db:generate` / `db:migrate`) contre un
  Postgres distant. C'est l'objet de l'issue #19 / `migrations-drift.md`.

### Config B — SQLite embarqué des Durable Objects (agent)

- Fichier : `apps/server/src/routes/agent/db/drizzle.config.ts`
- `dialect: 'sqlite'`, **`driver: 'durable-sqlite'`**, `out: './drizzle'`, `schema: 'schema.ts'`.
- Schéma : `threads`, `threadLabels`, `labels` (`routes/agent/db/schema.ts`) — un **cache de
  fils d'e-mail et de labels par instance de Durable Object**, pas des données applicatives
  centrales.
- Type d'accès : `DrizzleSqliteDODatabase` (`routes/agent/db/index.ts:6`), lié au stockage
  **embarqué** du Durable Object.

### Lien avec le SQLite des Durable Objects

Cloudflare Durable Objects exposent un **SQLite embarqué, par instance** via `ctx.storage`.
La classe `ZeroDriver extends DurableObject<ZeroEnv>` (`routes/agent/index.ts:341`) l'instancie :

```ts
// routes/agent/index.ts:400-404
constructor(ctx: DurableObjectState, env: ZeroEnv) {
  super(ctx, env);
  this.sql = ctx.storage.sql;
  this.db = drizzle(ctx.storage, { schema });   // drizzle-orm/durable-sqlite
}
```

Les migrations de cette base ne passent **pas** par drizzle-kit à distance : elles sont
**bundlées** (`routes/agent/db/drizzle/migrations.js` importe `meta/_journal.json` +
`0000_faulty_dragon_man.sql`) et **appliquées au runtime** dans le DO via le décorateur
`@Migratable({ migrations: _migrations })` (`routes/agent/index.ts:337`). Chaque instance de DO
migre son propre SQLite local, à froid, sans connexion réseau ni `DATABASE_URL`.

Son journal est **propre** : 1 entrée (`0000_faulty_dragon_man`, `dialect: sqlite`), 1 fichier,
0 orphelin, 0 préfixe dupliqué — vérifié par `migrations-consistency.mjs` (qui couvre les deux
répertoires).

## Décision

**Maintenir les deux configurations Drizzle isolées. La fusion est refusée — elle est de toute
façon techniquement impossible.**

Raisons :

1. **Dialectes incompatibles.** Postgres (`postgresql`) vs SQLite (`sqlite` / `durable-sqlite`).
   Un seul `drizzle.config.ts` ne peut pas cibler deux dialectes ; les types de colonnes, le SQL
   généré et les snapshots sont irréconciliables.
2. **Runtimes et cycles de vie distincts.** Config A migre une base distante au déploiement ;
   config B migre, à froid et par instance, le SQLite interne de chaque Durable Object au runtime
   (`@Migratable`). Aucune surface de mutualisation.
3. **Frontières de données distinctes.** `mail0_*` (état applicatif central) vs cache
   threads/labels **local à un DO** (dérivable, reconstructible, scoping par instance).
4. **Rayon de panne réduit.** Garder le journal de l'agent séparé et minimal évite de mêler la
   dérive historique du journal Postgres (#19) à la base des DO, qui est saine.

C'est donc **deux instances Drizzle légitimes et volontairement séparées**, et non une
duplication accidentelle à consolider.

## Conséquences

- **Positif :** séparation nette Postgres central / SQLite embarqué DO ; migrations DO
  auto-appliquées par instance ; journal DO trivialement cohérent ; `migrations-consistency.mjs`
  contrôle les **deux** répertoires (`apps/server/src/db/migrations` et
  `apps/server/src/routes/agent/db/drizzle`) et passe pour la config B.
- **Négatif / à assumer :** deux `drizzle.config.ts` et deux `_journal.json` à maintenir ; un
  contributeur doit savoir **quelle** config vise **quelle** base (`db:*` → Postgres ; migrations
  DO → bundle `@Migratable`). Ce présent ADR sert de repère.
- **Non-buts :** la garde `db:push` contre un usage prod est traitée par l'issue #29, hors de ce
  périmètre. Aucun changement de code applicatif n'est induit par cet ADR — il **statue**
  l'architecture existante, il ne la modifie pas.

## Vérification (l'ADR n'est pas contredit par le code)

- `apps/server/drizzle.config.ts` : `dialect: 'postgresql'`, `out: './src/db/migrations'`.
- `apps/server/src/routes/agent/db/drizzle.config.ts` : `dialect: 'sqlite'`, `driver: 'durable-sqlite'`.
- `apps/server/src/routes/agent/index.ts:341,403` : `class ZeroDriver extends DurableObject`,
  `drizzle(ctx.storage, { schema })`.
- `apps/server/src/routes/agent/db/drizzle/meta/_journal.json` : `dialect: sqlite`, 1 entrée.
