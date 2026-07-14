# FORK.md

Ce dépôt (`devlab-io/zero`) est un **fork** de `Mail-0/Zero` (remote `upstream`). Ce document liste
les divergences structurelles introduites, principalement pendant le run `niveau9` (issue #13). Il
complète `ARCHITECTURE.md` (l'état) et `docs/adr/` (les décisions).

## Relation au dépôt upstream

- **origin** : `https://github.com/devlab-io/zero.git` (ce fork).
- **upstream** : `https://github.com/Mail-0/Zero.git`.
- Licence (constaté, non tranché) : racine **MIT** ; **20 fichiers** portent un en-tête référençant
  l'**Apache License 2.0** assorti d'une **clause additionnelle restrictive** —
  `Reuse or distribution of this file requires a license from Zero Email Inc.` L'inventaire exact, le
  mapping origine→dérivés et la posture sont dans `LICENSE-NOTES.md` (voir aussi ADR
  `0009-license-posture.md`).

## Divergences de structure

| Domaine | Divergence | Référence |
|---|---|---|
| DO agent | Le god-file `routes/agent/index.ts` (2262 LOC) éclaté en modules cohérents ≤496 + barrel | ADR 0007 |
| Contrats de types | Package `@zero/types` (`packages/types`) au lieu d'imports relatifs `../server/src/**` | ADR 0004a |
| Frontière tRPC | Snapshot de types `AppRouter`/`Auth` committé (`trpc/app-router.boundary.d.ts`) + générateur | ADR 0006 |
| Routage | Une couche par responsabilité (Hono = HTTP brut, tRPC = API typée) | ADR 0002 |
| Observabilité | Logger structuré, tracing OTel, Sentry sans SDK, taxonomie d'erreurs | ADR 0003/0004b/0005/0008 |
| Persistance | Deux configs Drizzle isolées (Postgres + DO SQLite) | ADR 0001 |
| Driver Outlook | `lib/driver/microsoft.ts` gelé, exception loc-ratchet tracée | ADR 0011 |

## Divergences de surface MCP

La surface MCP a été retravaillée (#36, « surface MCP draft-only complète ») :
`apps/server/src/routes/agent/mcp.ts` (DO `ZeroMCP`) + `mcp-tools.ts` — capabilities, search, outbox
inspect/cancel/retry, `listThreads` compact via la projection (N+1 tués), `createDraft` idempotent,
mutations hors-whitelist retirées. Voir `MCP.md` pour les capacités exposées.

## Divergences CI / qualité

Le run a ajouté un pipeline de qualité gelé (détail dans `docs/testing.md` §CI) que l'upstream n'a
pas :

- Workflow `quality-and-security` (`.github/workflows/ci.yml`) : install → codegen → typecheck
  (blocking) → tests → lint sécurité → **ratchets non-croissants** (`loc-ratchet`, `type-ratchet`,
  `console-ratchet` dans `scripts/checks/`) → migrations-consistency → audit → agent-surface guard →
  secret scan (gitleaks épinglé) → build → dry-run bundles.
- **Deploy gate** (`.github/workflows/deploy-to-prod-command.yml`) : `/deploy` vérifie que
  `quality-and-security` a conclu `success` sur le SHA avant tout rebase/force-push de `main`.

## Posture de redistribution (stricte)

**20 fichiers restrictifs** portent un en-tête référençant l'Apache 2.0 **assorti d'une clause
additionnelle restrictive** : `Reuse or distribution of this file requires a license from Zero Email Inc.`
Décompte au HEAD : **22 correspondances « Zero Email Inc » = 20 restrictifs + `apps/mail/app/instrument.ts`
(commentaire de télémétrie, pas d'en-tête) + `apps/mail/components/home/footer.tsx` (branding UI)**.
Baseline `23359642` = **9 (7 restrictifs + instrument + footer)** ; lignée restrictive **7 → 20
(+13 dérivés : #22 +11, #36 +2)**. La portée de la clause et son articulation avec le MIT racine
**ne sont pas tranchées ici**. En conséquence,
la posture opérationnelle du fork est prudente : **PAS de redistribution, PAS de relicensing, PAS de
stripping** de ces fichiers **sans permission écrite d'upstream (`Zero Email Inc.`) OU une revue
juridique**. Les en-têtes (Apache 2.0 + clause) sont préservés verbatim sur tout module dérivé. Le
plan de sortie (permission/accord upstream ou réécriture clean-room, précédé d'une revue juridique)
et l'inventaire complet sont dans `LICENSE-NOTES.md`.
