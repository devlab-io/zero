# ADR 0008 — Taxonomie d'erreurs (codes stables, pas de fuite au client)

- **Statut :** Accepté
- **Date :** 2026-07-14
- **Issue :** devlab-io/zero#29 — [niveau9] V3.4 server-runtime-guardrails
- **Commit :** `063fd425` (env zod, logger, taxonomie erreurs, Sentry, tracing)
- **Périmètre :** `apps/server/src/lib/errors.ts` (taxonomie centrale) et
  `apps/server/src/routes/agent/errors.ts` (erreurs Effect de l'agent). Pas de changement de contrat
  d'API observable au-delà de la normalisation des réponses d'erreur.

## Contexte

Le check `observability.md` (axe A5) demande un traitement d'erreur central : un code d'erreur
métier stable à travers la frontière, et **aucune fuite** de message/stack interne au client. Avant
le run, les erreurs étaient renvoyées de façon ad hoc selon le chemin (tRPC vs Hono).

## Décision

Deux surfaces complémentaires, chacune avec sa raison d'être :

1. **Taxonomie centrale — `lib/errors.ts` (151 LOC).** Un ensemble restreint de codes métier
   **stables** : `VALIDATION, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, UPSTREAM,
   INTERNAL`. Chaque code mappe (a) un code d'erreur tRPC (pour les procédures) et (b) une réponse
   JSON Hono normalisée (pour les routes HTTP), avec un statut HTTP fixe. **Contrat :** une erreur
   métier connue garde son code de façon stable à travers la frontière ; une erreur inconnue est
   coercée en `500` générique qui **ne divulgue jamais** le message ou la stack sous-jacents. Testé
   dans `lib/errors.test.ts`.
2. **Erreurs Effect de l'agent — `routes/agent/errors.ts` (235 LOC).** Des classes d'erreur taggées
   (`_tag`) pour les flux Effect du DO agent : `StorageError`, `LabelRetrievalError`,
   `TopicGenerationError`, `LabelCreationError`, `BroadcastError`, … — permettant un routage
   d'erreur typé dans les pipelines Effect, extrait lors de l'éclatement #22 (ADR 0007).

## Conséquences

- **+** Réponses d'erreur prévisibles et non divulgantes sur les deux surfaces (tRPC + Hono).
- **+** `UPSTREAM` isole explicitement les défaillances des fournisseurs externes (Gmail, Resend…) du
  reste — utile au triage et à l'observabilité.
- **+** Les erreurs Effect taggées rendent le contrôle de flux de l'agent exhaustif et vérifiable.
- **−** Deux surfaces d'erreur (codes métier centraux vs erreurs Effect internes) coexistent ; elles
  ne sont pas fusionnées car elles servent des couches différentes (frontière client vs pipeline
  interne).
