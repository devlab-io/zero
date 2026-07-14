# Plan de chantiers — Zero Devlab « extraordinaire »

*Source : `docs/research/zero-extraordinaire.md` (handoff de recherche, 2026-07-06) + spec approuvée `docs/spec/agent-draft-queue.md`. Orchestration : architect / run `tartine`.*

Trois runs séquentiels. **Run 1 (tartine)** en cours d'exécution. Runs 2 et 3 planifiés,
gatés par leurs prérequis. Chaque run = une branche `factory/<run>`, une PR unique de clôture.

---

## Vue d'ensemble

| Run | Chantier | Contenu | Prérequis | Statut |
|---|---|---|---|---|
| **tartine** | 1 + 2 | Agent Codex draft-only + file de brouillons + vue /queue | — | **EN COURS** |
| **perf** | 3 | Local-first, sync, virtualisation, optimistic UI | Baseline build prod mesurée | Planifié |
| **signature** | 4 | Cmd-K enseignant, splits métier, snippets FR | Runs 1-2 mergés | Planifié |

Transverse (continu, hors run) : divergence upstream documentée, réécriture des 7 fichiers
sous licence restrictive, veille trimestrielle upstream.

---

## RUN 1 — `tartine` : Agent draft-only + File de brouillons

**But** : un agent local (Codex CLI ≥0.142) lit/triage les boîtes et **prépare des
brouillons, jamais n'envoie** ; une file permet de soumettre N jobs de brouillon,
les traiter, puis approuver/envoyer une-touche depuis une vue dédiée, avec undo 15 s.

**Garde-fou architectural non négociable** (lethal trifecta, Willison ; consensus Nylas/OWASP) :
l'agent ne détient jamais l'outil d'émission. `sendEmail` est retiré du MCP. L'envoi est
exclusivement humain (UI /queue).

### Décomposition en issues (vagues par dépendance)

#### Issue #2 — `outbox-core` (fondation serveur) — VAGUE 1, solo
Tout le reste en dépend → part seul.
- **Livrables** :
  - Table Drizzle `draft_outbox` : `id, connection_id, thread_id?, mission?, status, gmail_draft_id?, subject, body, idempotency_key, scheduled_send_at?, error?, created_at, updated_at`.
  - Migration Drizzle.
  - Machine à états en **fonctions pures** (testables hors DO) : transitions
    `queued → generating → draft_ready → approved → sending → sent | cancelled | failed`,
    avec gardes (double-approve interdit, cancel pendant countdown, retry depuis failed).
  - Router tRPC `outbox` : `list`, `enqueue`, `approve`, `cancel`, `retry`, `get`.
  - Handler d'alarme DO : `queued→generating` (génère via chaîne AI serveur existante) →
    crée draft Gmail → `draft_ready` ; `approved` → alarme T+15 s → `drafts.send` → `sent`.
  - Idempotence : `gmail_draft_id` + garde d'état → un item ne peut être envoyé deux fois.
- **Contrat d'interface** (publié pour #3 et #4) : signatures du router `outbox`,
  enum `DraftOutboxStatus`, type de ligne `DraftOutboxItem`.
- **MAY TOUCH** : `apps/server/src/db/schema.ts`, `apps/server/src/trpc/routes/outbox.ts` (nouveau),
  registre tRPC, `apps/server/src/lib/draft-outbox/**` (nouveau), migration, tests `*.test.ts`.
- **MUST NOT TOUCH** : `mcp.ts`, `apps/mail/**`, `docs/checks/**`.
- **Checks gelés** : typecheck serveur ; vitest transitions (double-approve, cancel-during-countdown,
  retry-after-failed, idempotence double-send) ; grep table + router présents.

#### Issue #3 — `mcp-draftonly` (durcissement agent) — VAGUE 2, ∥ avec #4, dépend de #2
- **Livrables** :
  - `mcp.ts` : **retirer** l'outil `sendEmail` (ligne ~238) ; **ajouter** `createDraft`
    (via driver Gmail `drafts.create`, `threadId` optionnel pour réponse en fil) et
    `enqueueDraftJob` (écrit dans l'outbox de #2).
  - Sanitizer `apps/server/src/lib/mail-sanitize/**` : HTML→texte, neutralisation
    texte caché / white-on-white / 0-point, marquage source non fiable (spotlighting léger).
    Appliqué au contenu de mail servi à l'agent.
- **MAY TOUCH** : `apps/server/src/routes/agent/mcp.ts`, `apps/server/src/lib/mail-sanitize/**` (+ test).
- **MUST NOT TOUCH** : outbox (#2), `apps/mail/**`, `docs/checks/**`.
- **Checks gelés** : grep **aucun** `registerTool('sendEmail'` ; grep `createDraft` +
  `enqueueDraftJob` présents ; vitest sanitizer (cas texte caché → neutralisé) ; typecheck.

#### Issue #4 — `queue-view` (surface de revue) — VAGUE 2, ∥ avec #3, dépend de #2
- **Livrables** :
  - Route `apps/mail/app/(routes)/queue/**` : liste des items outbox par statut.
  - Actions une-touche : approve / reject / open (réutilise le modèle clavier d/r/a/f/h).
  - Undo 15 s post-approbation (annule l'alarme → `cancel`).
  - Badge compteur dans la sidebar (entrée nav isolée).
- **MAY TOUCH** : `apps/mail/app/(routes)/queue/**` (nouveau), `apps/mail/components/queue/**` (nouveau),
  entrée nav sidebar (isolée), i18n en/fr des libellés queue.
- **MUST NOT TOUCH** : serveur, `mcp.ts`, autres routes mail.
- **Checks gelés** : typecheck mail ; route + composants présents ; grep appels au router `outbox` ;
  libellés i18n en/fr présents.

#### Issue #5 — `codex-setup-docs` (branchement + doc) — VAGUE 3, dépend de #3
- **Livrables** :
  - `docs/agent/codex-setup.md` : config `~/.codex/config.toml` (`[mcp_servers.zero]`,
    `url` vers `/mcp`, OAuth better-auth `codex mcp login zero`), prompts de mission d'exemple
    (« prépare les réponses en attente de compta@ »), procédure de test E2E manuel documentée.
  - Snippet de config exemple versionné.
- **MAY TOUCH** : `docs/agent/**`.
- **MUST NOT TOUCH** : tout code.
- **Checks gelés** : fichier existe ; contient `mcp_servers.zero`, `/mcp`, l'avertissement
  draft-only (aucun outil send), un prompt de mission d'exemple.

### Ordre d'exécution
```
Vague 1 : #2 (solo)         ── fondation outbox + contrat d'interface
Vague 2 : #3 ∥ #4           ── MCP + vue, disjoints, consomment le contrat de #2
Vague 3 : #5                ── doc de branchement, référence surface MCP finale de #3
```

### Test E2E manuel (hors gel, documenté dans #5)
1. `codex mcp login zero` (OAuth better-auth).
2. `codex exec` mission « prépare 2 réponses en attente sur compta@ ».
3. Vérifier : brouillons créés, items outbox `draft_ready`, **aucun** envoi.
4. Dans /queue : approve un item → countdown 15 s → `sent` ; undo l'autre → `cancelled`.
5. Confirmer côté Gmail/Shortwave que le draft approuvé est bien parti, l'autre non.

---

## RUN 2 — `perf` : Local-first & sync (chantier 3)

**Prérequis bloquant** : baseline build prod mesurée (Lighthouse + traces réseau + latences
DO/Hyperdrive depuis Tahiti — non couvertes par les benchs publics US/EU). Sans elle, on
optimise à l'aveugle.

### Chantier préalable — Baseline (à faire avant décomposition du run)
- Déploiement staging (Railway ou CF selon décision de déploiement encore ouverte).
- Mesures : Lighthouse (LCP, TBT, CLS), temps d'ouverture de fil, latence sync initiale,
  latence Hyperdrive froid vs chaud, latence R2 sur nos payloads de threads.
- Livrable : `docs/research/perf-baseline.md` — le goulot réel, chiffré.

### Issues candidates (à figer selon la baseline)
- **P1 — cache local-first** : IndexedDB via tanstack-query persist ; les fils lus survivent
  au reload ; ouverture instantanée depuis le cache. (Superhuman : DB locale = clé du <100 ms perçu.)
- **P2 — optimistic UI systématique** : `useOptimistic` (React 19) sur archive/read/label/snooze ;
  aucune action ne doit attendre le round-trip serveur.
- **P3 — préchargement du fil suivant** : prérendu du prochain thread en navigation j/k (pattern Superhuman).
- **P4 — virtualisation** : migration `virtua@0.41` → `@tanstack/react-virtual@3.x`
  (16,2 M dl/sem vs 0,7 M ; hauteurs variables mieux gérées).
- **P5 — tuning sync Gmail** : batch bodies ≤50 (messages.get = 20u, l'étape chère) ;
  backoff canonique (1/2/4 s + jitter, max 32-64 s) ; watch+Pub/Sub **avec** fallback
  `history.list` (push seul non fiable : 1 evt/s/user, droppable, historyId périssable).
- **P6 — skeletons vs spinners** : skeletons pour chargements >1 s, rien sous 1 s (NN/g).

---

## RUN 3 — `signature` : UX distinctive (chantier 4)

**Prérequis** : runs 1-2 mergés. Le pattern roi = discoverability → muscle memory.

### Issues candidates
- **S1 — Cmd-K enseignant** : palette qui affiche le raccourci à droite de chaque action
  (« watch the letter on the right ») → l'utilisateur cesse d'ouvrir Cmd-K.
- **S2 — Splits métier Devlab** : vues requêtées actionnables (≤7) — Relances, Factures/Kura,
  Clients, Interne. Compteurs masqués à zéro. (Pas des dossiers : des vues de priorité.)
- **S3 — Snippets FR/tahitien** : variables + alerte pré-envoi si placeholder non remplacé
  (ouverture « Ia ora na », clôture « Mauruuru roa, te aroha ia rahi » pour les relances).
- **S4 — IA en primitives clavier** : ghost-text Tab dans le compositeur, Y = ask AI —
  jamais un chatbot séparé. Contre-signal respecté (Notion Mail ferme 2026-09 : l'IA
  « magique » lasse) → prévisible et annulable.
- **S5 — get-to-zero guidé** : déjà posé (d/r/a/f/h) ; ajouter l'avance auto + undo bulk 7 j.

---

## Chantiers transverses (continus, hors run)

- **T1 — Divergence upstream** : `docs/FORK.md` documente ce qu'on a changé vs Mail-0
  (télémétrie retirée, billing stubbe, shortcuts, MCP draft-only) ; cherry-pick opportuniste
  seulement (upstream mort : staging figé août 2025).
- **T2 — Licence** : réécrire progressivement les **7 fichiers** portant l'en-tête restrictif
  (2 workflows, 2 thread-workflow-utils, 2 routes/agent, 1 lib/analyze) — ticket de sortie
  si l'on veut un jour redistribuer/publier. Usage interne : déjà OK.
- **T3 — better-auth MCP** : le plugin MCP actuel (OIDC) sera déprécié pour l'OAuth Provider
  Plugin → surveiller le changelog avant/après câblage Codex.
- **T4 — Veille upstream** : trimestrielle. Si Mail-0 ressuscite, réévaluer le cherry-pick ;
  sinon, Inbox Zero (11,5 k★, actif) reste l'assurance/comparateur.

---

## Risques & mitigations (rappel du handoff)

| Risque | Gravité | Mitigation |
|---|---|---|
| Injection de prompt via mail entrant | **#1** | Agent draft-only (pas d'outil send) + sanitizer HTML + spotlighting. CaMeL écarté (artefact recherche, 0 adoption produit). |
| Double-envoi (drafts.create non idempotent, 200≠envoyé) | Élevé | Clés d'idempotence + garde d'état outbox. |
| Perf optimisée à l'aveugle | Moyen | Baseline build prod avant tout run perf. |
| Divergence upstream ingérable | Faible | Upstream mort → pas de cadence de suivi ; cherry-pick opportuniste. |
| Redistribution du fork bloquée | Contextuel | 7 fichiers restrictifs → usage interne seul jusqu'à réécriture (T2). |

---

## Prochaines actions immédiates (run tartine)

1. Geler les checks des issues #2-#5 sous `docs/checks/tartine/`, commit de gel, push.
2. Passe unique de stress-test read-only sur la décomposition.
3. Dispatch vague 1 : builder Codex sur #2 (outbox-core), worktree isolé.
4. À la fin de #2 : check-runner → juge indépendant → merge → publier le contrat d'interface.
5. Dispatch vague 2 : #3 ∥ #4. Puis vague 3 : #5.
6. Job docs de clôture, PR unique `Closes #1`.
