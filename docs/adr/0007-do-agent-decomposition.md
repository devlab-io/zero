# ADR 0007 — Éclatement du god-file du DO agent en modules cohérents

- **Statut :** Accepté
- **Date :** 2026-07-14
- **Issue :** devlab-io/zero#22 — [niveau9] V2 refactor-agent-do
- **Commit :** `1b93aa02` (mergé `ce010215`)
- **Périmètre :** `apps/server/src/routes/agent/` uniquement. Aucun changement de comportement, de
  schéma SQLite, de décorateurs DO, ni de contrat RPC.
- **Lié à :** `ARCHITECTURE.md` §3.2, `docs/checks/niveau9/*structure*`

## Contexte

`apps/server/src/routes/agent/index.ts` était le plus gros god-file du dépôt : **2262 LOC** (mesuré
au dispatch #22), un seul fichier hébergeant trois classes Durable Object (`ShardRegistry`,
`ZeroDriver`, `ZeroAgent`/`AIChatAgent`) plus la surface d'erreurs/résultats Effect. La borne
loc-ratchet A1 (seuil 800/fichier) était dépassée d'un facteur ~2,8.

## Décision

Éclater le fichier en **modules cohérents ≤ 496 LOC**, un par responsabilité, tout en gardant
`index.ts` comme **barrel de ré-export exhaustif** (25 LOC) afin de préserver le snapshot d'exports
du module **octet-pour-octet** (exigé par le check structure) :

- `zero-driver.ts` — `ZeroDriver` (mailbox par connexion, SQLite `threads`/`thread_labels`).
- `chat-agent.ts` — `ZeroAgent` (`AIChatAgent`).
- `shard-registry.ts` — `ShardRegistry`.
- `errors.ts` — surface d'erreurs Effect taggées (voir ADR 0008).
- `projection.ts`, `sync.ts`, `outbox.ts`, `labels.ts`, `topics.ts`, `recipients.ts`, `internal.ts`
  — les grosses méthodes privées, extraites en délégateurs minces.

`main.ts` et `env.ts` continuent d'importer les classes depuis le barrel `./routes/agent` — surface
inchangée. Équivalence prouvée par AST : **36/36 exports** et **55/55 méthodes publiques** conservés ;
lignage du candidat vérifié avant merge (merge-base `ed684d40`) suite à une alerte SHA orphelin,
levée par inspection du DAG.

## Conséquences

- **+** Frontière de projection **nommée** (`projection.ts`) désormais consommable proprement par la
  projection riche (#30) et la surface MCP (#36) — voir `ARCHITECTURE.md` §4.
- **+** loc-ratchet A1 : `index.ts` passe de 2262 à 25 ; aucun module dérivé ne dépasse le seuil.
- **+** Chaque module dérivé **préserve l'en-tête de licence** (obligation Apache 2.0 §4) — les 11
  descendants sont inventoriés dans `LICENSE-NOTES.md` §3.
- **−** Le barrel exhaustif est plus verbeux qu'un `index.ts` minimal, mais c'est le prix du snapshot
  d'exports identique (décision assumée : « barrel complet, pas mince »).
