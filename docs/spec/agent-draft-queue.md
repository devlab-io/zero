# Spec — Agent draft-only + File de brouillons (« run tartine »)

Run: `tartine` · Repo: devlab-io/zero (fork interne, upstream mort — divergence assumée)
Research handoff: `docs/research/zero-extraordinaire.md` (2026-07-06)

## Goal

Un agent local (Codex CLI ≥0.142) peut lire/triager les boîtes connectées à Zero et
**préparer des brouillons, jamais envoyer** ; et un pipeline « file de brouillons »
permet de soumettre N jobs de brouillon, de les traiter, puis de les approuver/envoyer
une-touche depuis une vue dédiée de Zero, avec undo 15 s.

## Non-goals

- Perf/local-first (chantier 3 — exige une baseline build prod d'abord).
- UX signature Cmd-K/splits/snippets (chantier 4).
- Cron/scheduling de l'agent (après une semaine d'usage manuel).
- Envoi autonome par l'agent, sous quelque forme que ce soit.
- Multi-tenant/redistribution (7 fichiers sous licence restrictive non réécrits).

## Assumptions (défauts appliqués après silence 5 min — révocables)

- A1 Périmètre = chantiers 1+2 du handoff (agent sécurisé + file de brouillons).
- A2 Queue = table outbox Postgres (Drizzle) + Durable Object alarms ; pas de runtime
  additionnel ; at-least-once compensé par clés d'idempotence applicatives.
- A3 `sendEmail` est RETIRÉ du MCP (pas de flag). L'envoi passe exclusivement par
  l'humain : UI Zero ou approbation de file.
- A4 Surface de revue = vue dédiée `/queue` dans Zero (liste outbox, statuts,
  approve/reject une-touche, undo 15 s post-approbation).
- A5 Déclenchement agent = manuel (`codex exec` avec prompt de mission).

## Domain language

- **outbox item** : ligne de `draft_outbox` — un job de brouillon avec cycle de vie
  `queued → generating → draft_ready → approved → sending → sent | cancelled | failed`.
- **draft job** : demande de génération (threadId cible ou mission libre + connectionId).
- **approve** : action humaine dans /queue qui programme l'envoi à T+15 s (annulable).
- **mission** : prompt d'agent haut niveau (ex. « prépare les réponses en attente de compta@ »).
- **draft-only MCP** : surface MCP sans aucun outil d'émission.

## Architecture (retenue au design-it-twice, croquis en issue)

1. **MCP hardening** (`apps/server/src/routes/agent/mcp.ts`) : retirer `sendEmail` ;
   ajouter `createDraft` (via driver Gmail drafts.create, threadId optionnel pour
   réponse en fil) et `enqueueDraftJob` (écrit dans l'outbox). Sanitization : le
   contenu de mail servi à l'agent passe par strip HTML→texte (texte caché/white-on-white
   neutralisé) avec marquage de source non fiable (spotlighting léger).
2. **Outbox** : table Drizzle `draft_outbox` + tRPC router `outbox` (list/enqueue/
   approve/cancel/retry) + processeur DO alarm : `queued→generating` (génération via
   chaîne AI existante du serveur) → crée le draft Gmail → `draft_ready` ;
   `approved` → alarm T+15 s → `drafts.send` → `sent` (idempotence : `gmail_draft_id`
   + garde d'état ; un item ne peut être envoyé deux fois).
3. **Vue /queue** (apps/mail) : route + liste des items par statut, raccourcis
   une-touche (approve/reject/open), badge compteur sidebar, undo 15 s (annule l'alarm).
4. **Config Codex** : doc + fichier d'exemple `docs/agent/codex-setup.md` +
   `~/.codex/config.toml` snippet (mcp_servers.zero, url /mcp, OAuth better-auth),
   mission prompts d'exemple. Test de bout en bout manuel documenté.

## Validation strategy

- Checks gelés sous `docs/checks/tartine/` avant dispatch (repo-runnable, sans réseau
  Gmail : mocks driver au niveau tRPC/DO ; le E2E Gmail réel reste un check manuel
  documenté, hors gel).
- Typecheck ciblé (tsc --noEmit) et lint ciblé sur fichiers touchés.
- Tests unitaires : transitions d'état outbox (dont double-approve, cancel pendant
  countdown, retry après failed) ; MCP : absence de tout outil send + présence
  createDraft (test de surface) ; sanitizer : cas texte caché.
- Judge indépendant par issue ; merge par l'orchestrateur seulement sur PASS.

## Testing seams

- Driver Gmail déjà abstrait (`connectionToDriver`) → mockable.
- DO alarms : logique de transition extraite en fonctions pures testables hors DO.
- tRPC routers testables via caller direct (pattern existant du repo).

## Preflight evidence

- gh 2.96.0 (≥2.94) ; gh auth OK (tomatozor) ; remote devlab-io/zero ; mode github.
- Builder backend codex/best : CANARY: SHELLS_OK (2026-07-06, git log OK).
- Pas de docs/STOP. Worktree unique, staging propre (1 fichier utilitaire non lié).

## Open human decisions

Aucune bloquante. Révocables : A1-A5 ci-dessus.

## Approval record

- 2026-07-06 — In-session, repo owner (Thomas Verdenne), VERBATIM: « APPROVE »
  (message unique, en réponse à la demande d'approbation timed-ruling).
