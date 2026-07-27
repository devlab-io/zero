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

| Domaine           | Divergence                                                                                   | Référence                |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| DO agent          | Le god-file `routes/agent/index.ts` (2262 LOC) éclaté en modules cohérents ≤496 + barrel     | ADR 0007                 |
| Contrats de types | Package `@zero/types` (`packages/types`) au lieu d'imports relatifs `../server/src/**`       | ADR 0004a                |
| Frontière tRPC    | Snapshot de types `AppRouter`/`Auth` committé (`trpc/app-router.boundary.d.ts`) + générateur | ADR 0006                 |
| Routage           | Une couche par responsabilité (Hono = HTTP brut, tRPC = API typée)                           | ADR 0002                 |
| Observabilité     | Logger structuré, tracing OTel, Sentry sans SDK, taxonomie d'erreurs                         | ADR 0003/0004b/0005/0008 |
| Persistance       | Deux configs Drizzle isolées (Postgres + DO SQLite)                                          | ADR 0001                 |
| Driver Outlook    | `lib/driver/microsoft.ts` gelé, exception loc-ratchet tracée                                 | ADR 0011                 |

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

## Divergences de la surface produit (run `tartine`)

Ces divergences vivaient dans un second fichier `docs/FORK.md`, portant le même nom et un
périmètre différent. Deux documents de fork qui divergent valent moins qu'un seul : ils sont
fusionnés ici (run pitbull, axe 8).

- **Télémétrie** — les intégrations de remontée vers Zero Email Inc. sont retirées ou passées en
  opt-in : DSN Sentry, Dub, Intercom, Datadog ; PostHog et react-scan vérifiés conditionnés par
  l'environnement (`005859de`).
- **Durcissement auto-hébergement** — repli Twilio, origines de confiance pour les frontends
  locaux, port Hyperdrive local, facturation Autumn en opt-in, réparation du force-signout au
  login, valeurs par défaut locales base et front (`5e3888d0`).
- **Raccourcis clavier** — actions à la Superhuman : `d` traité, `r` répondre, `a` répondre à
  tous, `f` transférer, `h` rappeler ; suppression déplacée sur `mod+backspace` ; ciblage au
  survol restauré ; libellés en et fr (`5e3888d0`).
- **Surface MCP externe : draft.only** — `sendEmail` retiré ; `createDraft` et `enqueueDraftJob`
  ajoutés ; les corps de mail rendus au MCP sont assainis et encadrés.
- **File d'attente de brouillons** — table d'outbox, machine à états pure, routeur tRPC `outbox`,
  traitement par alarme de Durable Object, gardes d'idempotence, cycle approuver/annuler/réessayer.
- **Surface `/queue`** — revue des brouillons, badge « prêt », actions approuver/rejeter/ouvrir/
  réessayer, fenêtre d'annulation de quinze secondes, libellés en et fr.

### Frontière draft-only

La garantie draft-only porte sur la surface MCP/Codex externe : l'agent peut lire le courrier,
créer des brouillons Gmail et mettre en file un travail de brouillon, mais ne reçoit aucun outil
d'envoi. L'envoi humain reste dans Zero via `/queue` : approuver ouvre la fenêtre de quinze
secondes, annuler l'interrompt avant l'alarme.

### Risque interne : levé, contrairement à ce que disait la doc

`docs/FORK.md` signalait comme risque ouvert un outil d'envoi accessible à l'agent de chat interne,
en citant `routes/agent/tools.ts:283` et `Tools.SendEmail` dans `types.ts:228`. **Vérifié le
2026-07-26 : ce risque n'existe plus.** L'inventaire des outils exposés à l'agent est
`BuildGmailSearchQuery`, `BulkArchive`, `ComposeEmail`, `CreateLabel`, `GetCurrentDate`,
`GetThread`, `GetThreadSummary`, `GetUserLabels`, `InboxRag`, `MarkThreadsRead`,
`MarkThreadsUnread`, `ModifyLabels`, `WebSearch` — aucun envoi. `Tools.SendEmail` n'existe plus
dans `types.ts`, et les deux lignes citées pointent aujourd'hui sur tout autre chose
(`tools.ts:283` est `createLabel`). L'invariant « l'IA n'envoie jamais directement » est donc tenu
côté agent interne comme côté MCP.

### Politique de cherry-pick

Le staging upstream est traité comme gelé autour d'août 2025 et de fait inactif : pas de cadence de
merge permanente. On ne reprend que des correctifs clairs et utiles, après revue contre les
frontières de ce fork — télémétrie, auto-hébergement, draft.only.
