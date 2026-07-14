# Architecture Decision Records — index

Décisions **réellement prises** pendant le run `niveau9` (issue #13), chacune référencée à son issue.
Format : contexte / décision / conséquences.

## Index canonique

| N° | Fichier | Décision | Issue |
|---|---|---|---|
| 0001 | `0001-second-drizzle-config-durable-objects-sqlite.md` | Deux configs Drizzle isolées (Postgres + DO SQLite) | #19 |
| 0002 | `0002-routing-hono-vs-trpc.md` | Une couche de routage par responsabilité (Hono vs tRPC) | #24 |
| 0003 | `0003-tracing-strategy.md` | Stratégie de tracing (`lib/tracing.ts`) | #29 |
| 0004a | `0004-shared-types-package.md` | `@zero/types` — contrats partagés front↔serveur | #25 |
| 0004b | `0004-structured-logger.md` | Logger serveur structuré (`lib/logger.ts`) | #29 |
| 0005 | `0005-server-sentry.md` | Sentry serveur sans import SDK `@sentry/cloudflare` | #29 |
| 0006 | `0006-trpc-type-boundary.md` | Frontière de types `AppRouter`/`Auth` mail↔server | #43 |
| 0007 | `0007-do-agent-decomposition.md` | Éclatement du god-file DO agent (2262 → 12 modules) | #22 |
| 0008 | `0008-error-taxonomy.md` | Taxonomie d'erreurs (codes stables, pas de fuite) | #29 |
| 0009 | `0009-license-posture.md` | Posture licence : préservation des notices, pas de strip | #13 (AS-2) / #39 |
| 0010 | `0010-testing-strategy.md` | Stratégie de tests + statuts `@zero/testing` / `@zero/cli` | #21 / V0.1 |
| 0011 | `0011-microsoft-driver-frozen.md` | Driver Outlook gelé + exception loc-ratchet | #23 |

## Anomalies de numérotation (préexistantes — NON corrigées)

La règle du run interdit de renuméroter un ADR déjà committé (les numéros sont des références
stables). Deux anomalies héritées sont donc **documentées, pas modifiées** :

1. **Double `0004`** — `0004-shared-types-package.md` (`@zero/types`) **et**
   `0004-structured-logger.md` (logger) portent tous deux le numéro 0004. On les désigne 0004a et
   0004b dans l'index. Aucun des deux n'est renuméroté.
2. **Titre interne divergent dans `0002`** — `0002-routing-hono-vs-trpc.md` a un H1 qui lit
   « ADR 0001 — One routing layer… ». Le **nom de fichier `0002` fait foi** ; le H1 est un mislabel
   hérité. Non modifié.

Les nouveaux ADR reprennent la numérotation à **0007** (premier numéro libre après 0006), sans
réutiliser 0004.
