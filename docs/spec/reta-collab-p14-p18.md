# Reta — carte de continuation P12 → P18

État au 2026-08-02, commit de release `8c405e31496f` sur la branche
`codex/reta-team-collaboration`. Les migrations 0042 à 0046 sont appliquées en
production et les Workers front/serveur sont publiés. Chaque phase ci-dessous
liste l'ordre de dépendance, les points d'ancrage EXACTS dans le code actuel et
les invariants à ne pas casser.

Invariants transverses (toutes phases) :

- Email-first, AUCUN canal détaché des fils (`team-store.ts` en-tête).
- Tout élargissement d'ACL est explicite, visible, audité, révocable
  (pattern `team_thread_access` + `source` + notification + audit).
- Erreurs store en codes fixes `TeamStoreError` → mapping wire dans
  `apps/server/src/trpc/routes/teams.ts` (`TEAM_ERROR_CODES`).
- Nouvelle route tRPC ⇒ méthode façade DO (`apps/server/src/db/durable-objects.ts`)
  puis `pnpm run gen:trpc-boundary` (apps/server) AVANT le typecheck mail.
- Clés i18n : `apps/mail/messages/{en,fr}.json` PUIS
  `npx paraglide-js compile --project project.inlang --outdir paraglide`.
- Budget preload mail : 89/90 KiB gz — toute surface nouvelle du shell
  authentifié doit être lazy (pattern `mail-lazy-surfaces.tsx` /
  `*.deferred.tsx`).
- Motion produit 150–250 ms, reduced-motion-safe ; bans Impeccable (pas de
  gradient text, glass, confetti, grilles de cartes identiques, affordances
  inventées).
- Aucun envoi réel / archivage / suppression / invitation / événement
  calendrier / mutation Linear dans les tests.

## Matrice de preuve source actuelle — 2026-08-03

| Phase         | Exigence centrale                                          | Preuve ciblée actuelle                                                         | État                           |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| P12/P121/P122 | Landing complète, accessible, honnête, revue adversariale  | landing/roles UI 14/14, détecteur `[]`, score Impeccable 32/40, build 6/89 KiB | Prouvé source + Dia light/dark |
| P13           | Activation par faits réels, sans faux tour                 | serveur 12/12, mail logique+wiring 7/7                                         | Prouvé                         |
| P14           | Règles ACL-safe, claim/undo/simulation/confirmation        | serveur moteur+store 51/51, mail form+explication 9/9                          | Prouvé                         |
| P15           | Reviews, soft-lock et collision fail-closed                | serveur shared+store+PG+DO 35/35, mail 38/38                                   | Prouvé sur PG UTC              |
| P16           | SLA ouvré et pilotage ACL-first                            | serveur business-time+ops+store 39/39, mail dashboard 6/6                      | Prouvé                         |
| P17           | Rôles, audit signé, rétention, sessions, portabilité       | ciblés 107/107 dont 16 PG                                                      | Prouvé source/local            |
| P18           | Linear/email-first, webhooks signés, export/API, sans chat | ciblés 50/50 dont 13 PG                                                        | Prouvé source/local            |

Les 38 tests du routeur `teams` complètent transversalement P13–P16 ; le lot
dédié totalise donc serveur 175/175 et mail 60/60 sans compter deux fois ces
routes. Les suites exhaustives restent serveur 1116/1116 et mail 840/840.

## P13 — Activation collaboration factuelle — déployée et vérifiée

L'activation est une checklist Inbox dérivée des faits durables du store,
jamais une visite guidée ni une série de cases cochées côté client. Les cinq
étapes sont : équipe créée, invitation acceptée, premier fil partagé, premier
commentaire, puis premier fil assigné mené à Done. Le serveur reconstruit les
premières occurrences depuis l'audit append-only, borne le scan à 500
événements et n'utilise les fallbacks d'état courant (deuxième membre,
fil clos+assigné) que lorsque cette borne a réellement été dépassée. La durée
de boucle est calculée depuis la création de l'équipe jusqu'au dernier fait.

La carte `CollabOnboardingCard` est montée dans le dashboard Inbox ; l'ancien
tour Zero, ses vidéos et toute célébration artificielle ne sont plus montés.
Seul le masquage est une préférence par membre/équipe, fusionnée atomiquement
dans `team_member.prefs`. Les analytics utilisent un `$insert_id` déterministe
par équipe, événement et horodatage, plus un snapshot navigateur ; aucune
étape produit n'est déduite de ces analytics.

Preuves actuelles (2026-08-03) : `team-onboarding.test.ts` 12/12, logique et
wiring mail 7/7 ; ces tests font partie du lot P13–P16 serveur 175/175 et mail
60/60. Aucune invitation ni donnée externe n'a été créée en QA.

## P14 — Règles d'équipe ACL-safe — déployé et vérifié PostgreSQL

Turns reta-p14-01 puis reta-p14-hardening-02, release du 2026-08-02. La
sémantique SQL (claim unique, soft-delete, préflights d'undo) a tourné sur un
vrai PostgreSQL en transactions de test, puis la migration 0043 a été appliquée
en production avant le Worker. État du code :

Architecture : migration `0043_left_madame_hydra.sql` (`team_rule` +
`team_rule_run`, index UNIQUE (rule_id, thread_id)) ; types feuilles
`lib/teams/team-rules-shared.ts` (contrainte frontière tRPC) ; moteur pur
`team-rules.ts` ; store `team-rules-store.ts` (effets boîte injectés : KV
snooze get/put/delete, labels) ; pont worker `team-rules-runner.ts` ; hook =
workflow `team-rules` (automatic-only, fail-safe) ; routes `teams.*Rule*` ;
UI scindée `components/team/team-rules.tsx` + `team-rule-form.tsx` +
`team-rule-runs.tsx`, modèle pur `lib/team-rules-form.ts`.

Garanties durcies (hardening-02) :

- Idempotence ATOMIQUE : claim `outcome='processing'` inséré ON CONFLICT DO
  NOTHING sur l'unique (règle, fil) AVANT tout effet ; le même run est mis à
  jour applied/skipped/error sur tous les chemins ; un crash laisse
  'processing' — visible et bloquant, jamais un rejeu silencieux.
- Historique durable : delete = SOFT (deleted_at + enabled=false + audit) ;
  exclusions SQL explicites des listes/exécution/mutations ; les runs des
  règles supprimées restent nommés et annulables.
- Undo conditionnel : état APPLIQUÉ enregistré par action ; préflight complet
  avant toute mutation (assignee/labels/statut identiques à l'état posé,
  snooze vérifié contre la valeur KV courante) ; PROVENANCE
  `{source:'rule', ruleId, runId}` portée par chaque mutation team du run
  (turn provenance-03) — le préflight d'unshare n'ignore que les audits de CE
  runId exact : toute autre activité depuis le claim (action manuelle, y
  compris du créateur de la règle, ou autre règle) est un conflit, et les
  commentaires bloquent toujours ; conflit → zéro mutation + audit
  `rule.undo_conflicted`, run reste applied ; échec d'inverse → audit
  `rule.undo_failed`, jamais marqué undone, état possiblement partiel → revue
  manuelle requise ; inverses en ordre inverse.
- Simulation EXACTE : échantillon borné (≤20) lu en ENTIER via getThread
  (connexion active) — sender/domaine/To-Cc/corps/labels/heure réels ;
  lecture échouée = « non évalué », jamais non-match ; zéro écriture.
- Confirmation ACL serveur : toute règle portant `share` exige
  `confirmAclExpansion:true` FRAIS à la création, à la modification (règle
  résultante) et à la réactivation — garde store + garde route, UI nommant
  l'équipe et l'élargissement.

Limite opérationnelle restante : un run 'processing' orphelin après crash est
visible dans l'historique et bloque tout rejeu (comportement voulu), mais
nécessite une intervention manuelle — aucun reaper.

### Spécification d'origine (conservée pour référence)

Modèle : table `team_rule` (id, teamId, name, enabled, triggers jsonb, actions
jsonb, createdBy, createdAt/updatedAt) + `team_rule_run` (audit d'exécution :
ruleId, teamThreadId/threadId, outcome, reason, createdAt). Nouvelle migration
SQL (0042+) — première vraie migration depuis 0041, à valider en staging.

- Triggers : sender, domain, recipient, keywords, label Gmail, plages horaires
  — évaluation PURE dans `apps/server/src/lib/teams/team-rules.ts` (fonction
  `evaluateRule(meta, rule) → {matched, reason}`) testée sans PG, sur le même
  modèle que `team-onboarding.ts` (dérivation pure + wrapper store).
- Actions : share (réutiliser `teamStore.shareThread` — l'ACL du partage reste
  LE chemin unique), assign (`setThreadAssignee`), label partagé
  (`setThreadLabels`), todo (= status open + assignation), snooze (réutiliser
  `snooze-date.ts` côté client / route mail existante), notify (`notify()` du
  store).
- Point d'accrochage runtime : le pipeline de sync serveur
  (`apps/server/src/pipelines.ts` / `thread-workflow-utils`) — brancher
  l'évaluation post-ingestion, JAMAIS côté client.
- Préviaualisation/simulation : route `teams.previewRule` qui évalue la règle
  sur les N derniers fils SANS exécuter d'action (dry-run, retourne
  matched+reason par fil). Undo : chaque `team_rule_run` garde l'action
  inverse ; « désactiver immédiatement » = flag `enabled` lu à chaque run.
- Garde ACL : une règle ne peut JAMAIS élargir un accès silencieusement — un
  share déclenché par règle porte `source='rule'` dans l'audit et notifie
  comme un share manuel.
- UI : onglet « Rules » dans `/settings/teams` + entrée d'audit dans le panneau
  Team existant (`components/mail/team-panel.tsx`).

## P15 — Brouillons collaboratifs — déployé et vérifié PostgreSQL

Turns reta-p15-06 → final-hardening-08, release du 2026-08-02.

État du code : migration `0045_lying_lilith.sql` (`team_draft_review` avec
index unique PARTIEL — une review active par (fil, brouillon) —,
`team_draft_suggestion` bornée, `team_reply_claim` — un claim actif par fil —,
`team_reply_intent` — baseline serveur —, `presence.replying_until`),
appliquée et prouvée sur la base locale jetable (unicité partielle,
coexistence des états terminaux, re-claim post-accepted, override one-shot,
rollback propre). Modules : `team-drafts-shared.ts` (digest SHA-256 serveur
normalisé, détection pure des réponses entrantes de membres),
`team-drafts-store.ts` (cycle requested/changes_requested/approved/
cancelled/completed, revision monotone, refus stale double — digest réel vs
review ET vs base client —, rebase owner, suggestions texte-seul appliquées
par l'OWNER dans SON composeur via la couture d'insertion existante, intent +
claim + préflight), effets injectés lecture-seule (`team-drafts-runner.ts` —
le seul effet est getDraft ; le reviewer ne peut pas muter le Gmail du
propriétaire). Realtime : DO `TeamThreadRealtime` étendu `replying`
(multi-socket, TTL, purgé sur close/kick/unshare ; payload = horodatages
uniquement) + fallback DB. Envoi : `mail.send` accepte
teamThreadId/replyIntentId/override — préflight (réponses entrantes de
membres relues serveur + claims) AVANT createSendJob, claim atomique, retour
collision structuré sans job, override humain one-shot armé serveur, claim
résolu accepted/released, reviews actives closes (completed) à l'acceptation ;
idempotence clientSubmissionKey inchangée. UI : panneau review dans le Team panel
(demander/suggérer/comparer diff lignes borné/approuver/changements/
appliquer/rebase/annuler), « X rédige une réponse » soft-lock non bloquant
(composer + panel), bandeau collision avec « Envoyer quand même ».

Durci (hardening-07, prouvé sur PG réel + TipTap réel + DO instancié) :

- Préflight : le fil est relu via la connexion du PARTAGEUR résolue serveur
  APRÈS ACL, threadId de la réponse strictement égal à celui du partage,
  FAIL CLOSED sur toute lecture impossible (`collision_preflight_unavailable`)
  — jamais un préflight partiel qui laisse envoyer ; connectionId ne quitte
  jamais le serveur.
- Baseline : refusée si future (falsifiée), bornée à `now` sinon — impossible
  de la repousser pour masquer des réponses.
- Claim : pris APRÈS toutes les validations à retour anticipé, libération
  GARANTIE sur exception ; résolu `enqueued` (nom honnête : enqueue durable
  accepté, jamais « sent ») ou `released` ; un échec de résolution est loggé
  - retourné explicitement (`teamClaimResolution: 'failed'`), jamais avalé ;
    atomicité deux acteurs/deux clés + idempotence même acteur/même clé
    prouvées sur PG.
- Application d'une suggestion : patch BORNÉ à la prose éditable (avant le
  premier blockquote top-level) par transaction ProseMirror — citation,
  liens, signature et position de curseur préservés (testé sur éditeur réel),
  aucun setContent global.
- Replying : PAR SOCKET dans le DO (fermer un onglet ne coupe jamais l'autre,
  prouvé sur DO instancié).

Final (hardening-08, prouvé sur PG réel + routes mockées + couture UI pure) :

- Baseline de collision = REPLY INTENT SERVEUR (`team_reply_intent` publiée
  dans la migration 0045 + snapshot/schema, `db:generate` = « No schema
  changes ») : émis par `teams.createReplyIntent` au montage du composeur
  sous ACL, `baseline_at` DEFAULT now() côté base, TTL 24 h. `mail.send`
  prend `replyIntentId` et refuse absent/expiré/mauvais user-fil-provider
  (`reply_intent_invalid`) ; le champ `collisionBaseline` a été RETIRÉ du
  contrat — aucun timestamp client n'existe, la forge est impossible par
  construction.
- Override ONE-SHOT armé serveur : le premier préflight en collision marque
  `collision_detected_at` sur l'intent ; `overrideCollision` n'est consommé
  (update conditionnel atomique, fenêtre 10 min, `override_consumed_at` une
  seule fois) que contre une collision détectée par un préflight ANTÉRIEUR —
  un override envoyé d'emblée est refusé et re-affiche l'avertissement ;
  jamais d'auto-send.
- `clientSendId` OBLIGATOIRE avec `teamThreadId` (superRefine, refus AVANT
  tout claim/job) — deux requêtes sans clé = zéro job ; même clé = un job.
  Retry même intent + même clé : bypass idempotent via le claim déjà détenu
  (`findOwnReplyClaim`), intent/préflight non rejoués, job dédupliqué.
- `reviewId` vérifié en transaction AVANT claim : existe, appartient
  EXACTEMENT au teamThreadId (`not_found` sinon), appelant owner/reviewer
  (`forbidden` sinon) — prouvé cross-thread et non-partie sur PG, zéro claim
  résiduel.
- Jalon durable renommé HONNÊTEMENT `accepted` (schema claim outcome, reason
  `reta_reply_accepted`/`acceptedAt`, `teamClaimResolution`) — vrai pour
  l'envoi immédiat (Queue) comme pour le planifié long-terme (sweep cron,
  jamais « enqueued » mensonger) ; reviews closes via
  `markThreadReviewsCompleted` (état `completed`, audit
  `draft.review_completed`) — l'audit ne dit jamais « sent ».
- Multi-partage : la protection ne tombe JAMAIS (`resolveReplyTeamContext`,
  couture pure testée) — un partage : frictionless ; plusieurs : sélecteur
  compact `<select>` natif accessible clavier, défaut déterministe = premier
  partage (ordre serveur), l'intent est créé pour le partage choisi, la
  collision/override d'un contexte ne se transporte pas à l'autre.

Limites restantes libellées : un undo-send laisse le claim 'accepted' (le
préflight suivant le signale, override possible) ; l'échec Gmail après
acceptation reste visible dans la Queue, pas dans le claim ; les réponses de
membres n'entrant pas dans le fil du propriétaire restent indétectables
(scoping provider) ; suggestions = prose seule (PJ/destinataires/threading/
signature hors patch) ; en polling pur (socket absent), le signal replying
d'un onglet fermé peut persister jusqu'à 60 s (TTL) ; la base locale jetable
a été alignée sur UTC comme la prod (les colonnes timestamp sans tz supposent
un serveur PG en UTC) ; les intents expirés depuis plus de sept jours sont
maintenant moissonnés par le sweep P17 ; si l'émission d'intent échoue au
montage, elle est retentée à l'envoi (baseline plus tardive pour cette seule
soumission — fail closed sinon).

### Spécification d'origine (conservée pour référence)

- Ownership + reviewer : table `team_draft_review` (teamThreadId, draftId,
  ownerUserId, reviewerUserId, state requested/approved/changes, note,
  updatedAt). Le brouillon Gmail reste chez son propriétaire (connexion du
  sharer via le proxy borné `team-access.ts` — NE PAS exposer
  sharerConnectionId).
- Suggested edits + diff : diff TEXTE côté client (lib pure testée, pas de
  dépendance lourde — réutiliser l'infra de `thread-quote.ts` pour les bornes).
- « Qui répond » : étendre le heartbeat présence existant
  (`teamThreadPresence`, `useTeamRealtime`) avec un champ `replying: boolean`
  — le DO `TeamThreadRealtime` broadcast déjà presence/typing, ajouter le flag
  au payload (v3 des migrations DO si besoin).
- Soft lock non bloquant : dérivé de `replying` (bandeau « X est en train de
  répondre », jamais un verrou dur).
- Détection double réponse : au `sendStoredDraft` (existant, P7), vérifier
  côté serveur si un AUTRE membre a envoyé une réponse sur le fil partagé
  depuis l'ouverture du composeur → avertissement bloquable, pas d'interdit.

## P16 — Dashboard opérations — déployé avec P14 SLA

Turn reta-p14-sla-p16-04, release du 2026-08-02.

État du code : migration `0044_flashy_pete_wisdom.sql` (`team_sla_policy` une
ligne par équipe : objectifs first-response/résolution en minutes OUVRÉES,
zone IANA, heures/jours ouvrés ; `team_member_absence` : fenêtres plates
déclarées). Moteur ouvré `business-time.ts` (segments UTC par convergence
d'offset, DST testé Paris printemps/automne). Agrégats purs `team-ops.ts`
(nearest-rank médiane/p90 + sampleSize, overdue, reopen/transfer, workload
alphabétique sans score, couverture, processing >15 min). Store
`team-ops-store.ts` : policy `team.manage` (owner/admin) auditée, absences
self-or-owner
(un membre ne déclare JAMAIS pour autrui — testé), overview avec
`accessPredicate` de l'appelant AVANT toute agrégation, événements restreints
aux fils visibles, bornes 1000 fils / 5000 événements + flags truncated,
fenêtre 1–90 j (défaut 30). Durci (hardening-05, prouvé sur PG local
jetable) : « première réponse » = send_job 'sent' joint sur le COUPLE EXACT
(sharerConnectionId, threadId provider) avec updatedAt STRICTEMENT postérieur
au partage, mappé par teamThreadId — les threadIds Gmail étant scopés par
connexion, tout group-by threadId seul serait une collision cross-account ;
resolvedInWindow = fils DISTINCTS clos dans la fenêtre (close répété = 1) ;
volume partagé/résolu PAR LABEL d'équipe (labelVolumes, liens bornés 5000 +
flag, fils ACL-visibles uniquement, multi-label compte dans chaque label).
P14 : « pourquoi ce fil m'a été assigné » visible dans le panneau Team du fil
(listRuleRuns filtrable par teamThreadId DANS la porte ACL de Root — creator
ou accessPredicate ; dernier run applied assign/todo, raison seule, jamais
inverse/applied/connectionId ; erreur non bloquante). Migration 0044
APPLIQUÉE sur la base locale jetable : tables/FK/index conformes,
transaction policy+absence rollback propre, preuves psql anti-collision et
ACL restricted en transactions ROLLBACK. UI `/team?view=ops` en lazy :
skeleton/erreur/vide/retry, réglage policy (owner) + déclaration d'absence,
flat/tokens/reduced-motion. Limites : fils retirés du partage sortis des
agrégats ; volumes au-delà des bornes lus comme minima ; les réponses
envoyées par d'AUTRES membres depuis leurs propres boîtes ne sont pas
rattachables (threadIds scopés par connexion) — seule la boîte du partageur
compte, libellé en conséquence. La migration 0044 est appliquée en production ;
la route `/team?view=ops` est vérifiée en navigation HTML et par Codex CUA dans
Dia. Le compte de QA n'ayant aucune équipe, la validation visuelle s'arrête à
l'état vide réel, sans créer de données artificielles.

### Spécification d'origine (conservée pour référence)

- Données : TOUT est déjà dans `team_thread` (status, assignee,
  lastActivityAt, createdAt) + `team_audit_log` (status_changed, assigned) +
  `team_thread_comment`. Routes lecture seule `teams.opsOverview(teamId)` :
  open, unassigned, overdue (seuil configurable), plus ancien sans réponse,
  workload par membre (compte, PAS un score de performance individuel — pas de
  classement, pas de moyenne par personne affichée comme note), temps de
  première réponse et de résolution (dérivés d'audit, même technique bornée
  que `team-onboarding.ts`), volume par label, reopen/transfert (=
  status_changed open après closed / assigned successifs), couverture/absence
  (à défaut de données RH : présence déclarée par membre, table
  `team_member_absence` simple).
- UI : vue « Ops » dans `/team` (onglet à côté de Shared/Assigned/Mentions),
  composants du dashboard inbox (`inbox-dashboard.tsx`) réutilisés — cartes
  plates, états d'erreur « indisponible + retry », jamais de faux zéro.

## P12 / P121 / P122 — landing Reta refondue, preuve visuelle post-fix PASS

La landing publique porte désormais une proposition unique et honnête :
« Handle email together, without moving it to chat ». Les CTA `Get started`
convergent tous vers `/login` (plus d'OAuth isolé dans le hero), les trois
piliers sont email-first, le jargon MCP est relégué à une automatisation
optionnelle, et chaque bloc narratif expose un seul heading sémantique.
Navigation, thème, ressources et réseaux sociaux ont des noms accessibles,
des cibles de 44 px et des focus natifs ; la grille de fonctions ne passe en
trois colonnes qu'au breakpoint large, les shortcuts et le footer se replient.

Passe adversariale Impeccable : double assessment
`/root/p121_design_review` + `/root/p121_detector`, score source post-fix
32/40, zéro P0/P1, détecteur déterministe post-fix `[]`. Les tests landing et
rôles UI passent 12/12, typecheck/lint/build passent. Snapshot :
`.impeccable/critique/2026-08-02T23-26-09Z__apps-mail-components-home-homecontent-tsx.md`.

Computer Use final : la landing reconstruite a été inspectée en lecture seule
dans Dia sur le serveur local 3100, page entière, en light puis dark. L'arbre
AX expose le menu mobile sous le nom `Open navigation` et un seul heading par
bloc narratif. Après ouverture, le panneau est le seul dialogue/modal exposé ;
`Escape` le démonte, restaure le contenu principal, remet le trigger à
`Open navigation` et lui rend le focus. Le backdrop ferme aussi le panneau.
Aucun clic métier/externe, aucune action Chrome/Orca et aucune mutation de
données n'ont été exécutés.

## P17 — LIVRÉ + REVU (Fable puis revue Codex, 2026-08-03) — voir reta-collab-p17-governance.md

Le périmètre autorisé a été implémenté : rôles owner/admin/member/guest/
auditor (matrice de capacités `team-roles.ts`, ACL role-aware, zéro
migration pour la colonne), export SIGNÉ du journal d'audit (HKDF sur le
ring KEK + HMAC canonique, vérification serveur), rétention bornée 30..730 j
(table 0047 + sweep planifié audité), sessions/appareils révocables
(better-auth, tokens jamais exposés), export/restauration de données
d'équipe (nouvelle équipe, plan pur, round-trip PG prouvé). Détails,
décisions et différés : `docs/spec/reta-collab-p17-governance.md`.
SAML/SCIM/legal hold restent EXPLICITEMENT différés sans prospect nommé.
La revue indépendante a ajouté la sérialisation du dernier owner, la
révocation realtime à chaque rôle/retrait, les gardes sur mutations
historiques, la restauration non-bearer liée à la source et le curseur de
sweep équitable `last_swept_at` (migration 0048).

## P18 — Intégration Linear — base déployée fail-closed, revue 0049 prête à publier

Turn reta-p18-09 + hardening-10 + adversarial-11, release du 2026-08-02.

État du code (email-first, aucun chat, AUCUN appel Linear réel en dev/QA) :

- **Migration 0046** (`0046_messy_molly_hayes.sql`, générée par drizzle,
  appliquée + prouvée psql ROLLBACK sur la base jetable puis appliquée en
  production, `db:generate` = « No schema changes ») :
  `team_integration_install` (une par équipe+provider,
  tokens/PKCE en ENVELOPPES SCELLÉES jsonb, workspace pour corrélation
  webhook), `team_integration_mapping` (slots explicites team/status/assignee,
  unique par (install,kind,retaValue)), `team_thread_issue_link` (un lien
  ACTIF par (fil,issue) — index unique partiel, unlink soft audité),
  `team_external_link` (CRM/client manuel, https exigé),
  `team_issue_create_request` (idempotence (install,clientRequestKey)),
  `integration_webhook_delivery` (claim anti-replay (provider,deliveryId)),
  `team_outbound_webhook` + `team_outbound_delivery` (outbox retry borné 5,
  backoff, 'dead' visible). AUDIT : `actor_user_id` NULLABLE + `actor_kind`
  user/system/integration (défaut 'user' — l'historique existant est intact,
  `listTeamAudit` passe en leftJoin, prouvé PG).
- **Secrets** : vault d'enveloppe RÉUTILISANT byok-crypto (ring KEK
  RETA*BYOK_KEK*\*, AAD scopés team+purpose+record — une enveloppe volée
  d'une autre portée est inerte, prouvé). `LINEAR_CLIENT_ID/SECRET` +
  `LINEAR_WEBHOOK_SECRET` optionnels : absents → FAIL CLOSED
  (`integration_vault_unavailable`/`integration_not_configured` →
  PRECONDITION_FAILED) et l'UI owner affiche « configuration manquante » sans
  rien bloquer d'autre. Aucun secret n'est renvoyé/loggé (présence booléenne).
- **OAuth** : code + PKCE S256 + state (consommé une fois), scopes MINIMAUX
  `read,issues:create` (jamais write/admin — webhooks configurés côté app) ;
  access ~24 h + refresh ROTATIF (rescellé à chaque refresh,
  `linear-runtime.ts`) ; callback = page authentifiée
  `/integrations/linear/callback` → `integrations.completeInstall` (owner de
  l'équipe de l'install exigé). `OAuthApp revoked` (webhook) → install
  revoked + tokens EFFACÉS + audit SYSTÈME actorUserId NULL (prouvé PG).
- **Flux fil** (TeamPanel, accessible clavier) : préparation depuis le SUJET
  capturé au partage + backlink Reta ACL `/team?team=…&thread=…` (le viewer
  revérifie l'accès), selects team/status/assignee ISSUS DES MAPPINGS
  owner-only (jamais d'inférence boîte active), aperçu EXACT, `confirm:
z.literal(true)` à chaque requête, `issueCreate` via client GraphQL injecté ;
  lien persisté APRÈS succès seulement ; retry même clé = même issue (prouvé
  PG, fake client, 1 seul appel) ; échec → ligne 'failed' rejouable, zéro
  lien. Issue id/url affichés, unlink audité. Suggestions = identifiants
  détectés (lib pure `linear-issue-draft.ts`) — APERÇU seul jusqu'à Accept
  (résolution serveur, lien audité).
- **Webhook entrant** : route Hono racine `/integrations/linear/webhook` —
  octets BRUTS avant tout JSON, HMAC-SHA256 timing-safe (longueurs incluses),
  `webhookTimestamp` ±60 s strict, secret absent → 503, `Linear-Delivery`
  claim atomique (replay → 200 idempotent zéro effet), corrélation EXACTE
  workspace→install + issue→lien actif, status/assignee reflétés UNIQUEMENT
  via mappings (audit actorKind 'integration', actorUserId NULL), JAMAIS de
  création de fil/lien.
- **Webhooks sortants** (owner-only) : HTTPS public exigé, défense SSRF en
  profondeur (schéma/userinfo/hôtes locaux/IP littérales privées/résolution
  DNS injectée — DoH en prod — /redirect refusé), secret scellé, signature
  HMAC `${ts}.${deliveryId}.${body}` + en-têtes X-Reta-\*, enqueue
  TRANSACTIONNEL sur assign/comment/status (métadonnées seules — jamais de
  corps email/PJ, prouvé), outbox retry borné/backoff/dead.
- **Export d'activité** : `integrations.exportActivity` owner-only, curseur
  (createdAt|id) stable, limite ≤200, schéma figé avec actorKind — aucune
  donnée mailbox implicite.
- **Tests** : 19 purs (vault AAD/ring, PKCE/rotation, HMAC/timestamp/
  timing-safe, SSRF/redirect/signature), 8 PG comportementaux ROLLBACK
  (ACL owner/member/outsider, idempotence création, échec rejouable, webhook
  claim/sync/ignoré, OAuthApp revoked, outbox dead, export paginé), 5 route
  Hono mockée, 7 routeur tRPC, 7 contrats schéma 0046, 5 lib mail pure.

Hardening-10 (turn reta-p18-hardening-10 — les trous de production sont
FERMÉS, pas documentés) :

- AUDIT : FK actor_user_id recréée ON DELETE SET NULL (supprimer un compte ne
  détruit JAMAIS l'audit — prouvé PG + psql) + CHECK actor_kind ∈
  {user,system,integration} + CHECK system/integration ⇒ actor_user_id NULL ;
  user ⇒ non-null garanti à l'INSERT par audit() (un CHECK bilatéral
  bloquerait le SET NULL de la suppression de compte — documenté).
- OAUTH : seul le HASH SHA-256 du state est persisté, state_expires_at 10 min,
  consommation ONE-SHOT en UN update conditionnel RETURNING (deux callbacks
  concurrents : un seul gagne — prouvé PG) ; callback lié à installedBy ET au
  rôle owner ACTUEL ; scopes du grant validés EXACTEMENT read+issues:create
  (toute surprise refusée AVANT stockage de token) ; refresh RÉEL avant
  GraphQL si expiration proche + UNE relance après refresh forcé sur 401
  (sinon fail closed) ; revoke owner appelle l'endpoint officiel
  /oauth/revoke via effet injecté puis efface local DANS TOUS LES CAS avec
  retour explicite remote ok/failed/skipped ; relancer l'OAuth sur une
  installation ACTIVE exige reconnectConfirm explicite.
- PREVIEW/CONFIRM : `previewIssue` persiste l'aperçu CANONIQUE serveur (titre
  dérivé du sujet capturé au partage, backlink construit SERVEUR depuis
  l'origine publique — inforgeable —, note bornée, digest SHA-256, expiry
  15 min) ; `confirmIssue` n'accepte QUE previewId + clé + digest (un
  title/description surnuméraires sont STRIPPÉS au schéma, prouvé) ; ACL et
  mappings REVALIDÉS à la confirmation ; digest altéré / clé étrangère /
  autre acteur / aperçu expiré / mapping retiré → refus sans appel Linear
  (suite tamper PG).
- IDEMPOTENCE/RECONCILE : même clé pour un autre fil/acteur →
  `idempotency_conflict` sans fuite ; erreurs Linear TYPÉES (LinearApiError)
  — GraphQL errors/4xx/success:false = échec PROUVÉ rejouable ('failed') ;
  réseau/5xx = issue INCONNUE → `needs_reconciliation`, JAMAIS rejoué (Linear
  n'a pas d'idempotence documentée — aucune fausse garantie), bail pending
  90 s moissonné vers reconcile ; l'owner relie manuellement via la recherche
  exacte + Accept ; lien + audit dans UNE transaction après succès.
- WEBHOOK ENTRANT : claim + traitement + processed dans UNE TRANSACTION — un
  échec ANNULE le claim (l'événement n'est pas perdu, Linear retente ; prouvé
  PG rollback-reclaim) ; replay 200 UNIQUEMENT si la ligne est processed,
  sinon 409 in_flight ; en-tête Linear-Timestamp exigé et cohérent (±60 s)
  avec le webhookTimestamp du corps authentifié ; Linear-Delivery UUID
  STRICT ; payload officiel OAuthApp revoked couvert.
- OUTBOX : `runOutboundDeliverySweep` BRANCHÉ dans main.ts scheduled
  (Hyperdrive, descellement minimal du secret, DoH+SSRF à CHAQUE tentative,
  signature, redirects refusés) ; statut 'sending' + claimed_at avec claim
  CAS par ligne (attempts comptés AU claim — deux crons ne livrent jamais en
  double, prouvé) ; reaper des baux périmés (crash → pending ou dead) ;
  auto-désactivation après 20 échecs consécutifs (réactivation owner remet le
  compteur à zéro) ; retry MANUEL owner des livraisons dead (route + UI) ;
  la création de webhook applique la garde SSRF COMPLÈTE avec résolveur
  injecté ; IPv6 durci (multicast ff00::/8, doc 2001:db8, discard 100::,
  NAT64 64:ff9b, mappées IPv4 classées).
- SCHÉMA/UI : installedBy nullable SET NULL (l'installation survit à la
  suppression du compte installateur) ; imports doublons corrigés ; CHECKs
  statuts create_request/outbound_delivery ; UI en DEUX temps (édition →
  aperçu canonique dans une zone de confirmation distincte → création par
  référence), états loading/error/expired/in-flight/reconcile/dead-webhook/
  auto-disabled + retry, clavier natif, light-dark tokens, motion-safe.

Adversarial-11 (turn reta-p18-adversarial-11, passe finale bornée) :

- State OAuth : la consommation atomique est FENCÉE sur installedBy=userId
  dans le WHERE — un autre utilisateur qui présente le state n'obtient rien
  ET n'invalide pas le flux de l'owner (prouvé PG : mauvais user → null puis
  owner consomme ; concurrence même owner → un seul ; expiry).
- Certitude d'effet issueCreate : un 2xx avec `errors` GraphQL ou un JSON
  ambigu est classé 'unknown' → needs_reconciliation (une mutation GraphQL
  peut avoir un effet partiel) ; SEULS success:false explicite et 4xx (refus
  avant exécution) sont 'proven_failed' rejouables ; matrice testée
  (200+errors, data:null, corps non-JSON, success:false, 4xx, 401, 5xx,
  réseau) + retry 401 UNIQUE après refresh forcé (rebuild une fois, jamais de
  boucle, non-401 ne rafraîchit jamais).
- Rotation refresh concurrente : `refreshInstallTokens` est un CAS fencé sur
  l'enveloppe d'access lue — le perdant n'écrase JAMAIS les tokens frais et
  RELIT ceux du gagnant (prouvé PG avec scellement réel).
- Cron : `runScheduledTasksIsolated` (lib pure testée) — l'échec des emails
  planifiés ou des souscriptions ne prive plus jamais le sweep outbound P18.
- Outbox : updates de COMPLÉTION fencés (status='sending' + claimedAt exact)
  — un worker zombie post-bail ne marque jamais delivered (prouvé PG) ;
  timeout d'envoi 10 s explicite ≪ bail 5 min ; contrat AT-LEAST-ONCE
  documenté (deliveryId stable X-Reta-Delivery, le récepteur déduplique —
  exactly-once jamais promis).
- Pont P17→P18 (revue Codex 2026-08-03) : guest/auditor ne peuvent plus
  ajouter/retirer de lien ni lancer preview/confirm ; les mappings assignee
  refusent les rôles sans `thread.write`, restent supprimables après
  rétrogradation et sont revalidés (rôle + ACL du fil) à la confirmation et à
  chaque webhook entrant. Un mapping stale est ignoré, jamais appliqué comme
  assignation.

Review-12 (Fable puis revue Codex, 2026-08-03) :

- **Ordre des événements Linear** : migration 0049
  (`0049_lying_wallflower.sql`) ajoute
  `team_thread_issue_link.last_linear_updated_at`. Le webhook exige le
  `data.updatedAt` officiel et avance ce watermark par update atomique
  strictement plus récent AVANT toute mutation du fil ou audit. Un retry
  ancien ne peut donc plus rouvrir ou réassigner un état plus récent (prouvé
  sur PostgreSQL : closed récent puis open ancien, état et watermark restent
  récents).
- **Contrat webhook officiel** : l'en-tête `Linear-Timestamp` est bien
  documenté par Linear et reste exigé, authentifié et comparé au timestamp du
  corps avec une fenêtre ±60 s. Référence :
  https://linear.app/developers/webhooks.
- **Export/route** : le curseur d'export est validé à l'entrée au format
  `createdAt|UUID` borné ; un curseur malformé ne devient plus un faux 404.
  Un test structurel verrouille le montage du webhook Linear à la racine,
  hors du sous-routeur `/api`.
- **Preuves** : ciblés P18 50/50 dont 13 PG, serveur complet 1116/1116, mail
  840/840, deux typechecks verts, ESLint 0 erreur, build production vert et
  `db:generate` sans changement après 0049. La chaîne Drizzle 0000→0049 passe
  depuis une base vide avec 50 migrations journalisées ; 0049 est appliquée
  uniquement sur cette base jetable. La production attend le gate visuel P12.

Limites restantes libellées : `listLinearTargets` (config des mappings) exige
l'API Linear vivante — hors QA l'UI affiche l'erreur et réessaie ; la
résolution d'identifiant (Accept) passe par issueSearch avec correspondance
exacte côté serveur ; le webhook entrant utilise le signing secret
d'APPLICATION (un seul, env — correct pour une app Linear) ; le CHECK
« user ⇒ acteur non nul » est applicatif à l'INSERT (incompatibilité SQL avec
le SET NULL de suppression de compte, documentée) ; l'export borne à 200/page
et l'UI à 2000 entrées par téléchargement.

## Baseline de prépublication — lecture seule, 2026-08-03

- Cloudflare actif : `zero-server-production` sert la version
  `6e3385be-0925-468d-8d6f-b0a7518c87b1` (secret change, code issu de la
  release 0046) ; `zero-production` sert
  `beea0e38-634b-4a09-9f56-01d9c5ed138e`.
- Les noms `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET` et
  `LINEAR_WEBHOOK_SECRET` sont maintenant présents dans les secrets du Worker.
  Aucune valeur n'a été lue, aucun OAuth/install/webhook n'a été déclenché et
  leur présence seule ne prouve pas la configuration externe Linear.
- Hyperdrive production pointe vers le service Railway `Postgres-vjKE`. La
  base répond en `Etc/UTC`; son journal Drizzle contient 47 entrées (jusqu'à
  0046). `mail0_team_retention_policy`, `last_swept_at` et
  `last_linear_updated_at` sont absents, comme attendu avant cette release.
- Baseline HTTP : `/health` répond 200 ; les navigations HTML `/`, `/team`,
  `/team?view=ops`, `/team?view=integrations` et
  `/integrations/linear/callback` répondent 200 avec le shell
  `<title>Reta by Devlab</title>`. Un fetch d'asset générique `Accept: */*` sur
  une deep-link reste volontairement 404, conformément au Worker SPA qui ne
  masque jamais les chunks manquants par de l'HTML.
- Ordre de publication verrouillé : gate visuel P12 **PASS** → commit/push →
  appliquer 0047, 0048 et 0049 sur cette base → vérifier journal/colonnes/CHECKs →
  déployer le Worker serveur → health/route checks → déployer le Worker mail →
  QA Dia lecture seule. Au moment de cette baseline, seules les étapes après
  le gate visuel restent à exécuter.

## Preuves de release production — 2026-08-02

Cette preuve décrit la release 0046 déjà en production. Les hardenings P17
0047/0048, P18 0049 et la landing P12/P121/P122 ci-dessus ne sont pas encore
publiés au moment de la revue du 2026-08-03.

- Base production : journal Drizzle vérifié jusqu'à 0046 ; hashes 0042–0046
  présents, tables/index/FK/CHECK attendus vérifiés. L'état 0042 préexistant a
  été constaté colonne par colonne avant journalisation chirurgicale sous
  advisory lock ; aucune donnée métier n'a été modifiée.
- Gates : serveur 1053/1053 (97 fichiers), mail 831/831 (131 fichiers), deux
  typechecks verts, ESLint sans erreur, build production vert avec preload
  89/90 KiB gzip, contrôle agent-surface vert et scan gitleaks staged sans
  fuite. Les E2E historiques qui envoient ou mutent de vrais emails n'ont pas
  été lancés conformément au garde-fou de QA.
- Déploiement : Worker serveur version
  `06c0ef19-7aa2-4c3b-9106-a0e6d6d5c511`; Worker mail version publiée
  `8ab62c17-24d3-40a8-96ac-91c90810c1de`. `/health`, `/`, `/team`,
  `/team?view=ops`, `/team?view=integrations` et
  `/integrations/linear/callback` répondent 200 pour une navigation HTML.
- Codex CUA dans Dia, lecture seule : `/team?view=ops` et
  `/team?view=integrations` affichent la session Reta authentifiée, les cinq
  onglets Shared/Assigned/Mentions/Ops/Integrations, un état vide d'équipe
  explicite et aucune erreur. Aucun clic ni mutation n'a été effectué.
- Activation Linear au moment de cette release : `LINEAR_CLIENT_ID`,
  `LINEAR_CLIENT_SECRET` et `LINEAR_WEBHOOK_SECRET` étaient absents. Ils ont été
  ajoutés ensuite par trois secret changes le 2026-08-03 (voir baseline
  ci-dessus). L'OAuth, les mappings et les webhooks réels restent volontairement
  non exercés en QA pour éviter toute mutation externe.

## Dettes/restes connus hors phases

- `/pricing` public = contenu Zero obsolète (promesses IA, $20/mo) — refonte
  marketing honnête à faire avec décision pricing Reta (hors r8 : page
  marketing publique). Non lié depuis la nav/footer actuels.
- Les assets vidéo d'onboarding legacy (`/onboarding/step*.mp4`) restent dans
  `public/` mais leur ancien dialog n'est plus monté : l'Inbox utilise
  exclusivement la checklist factuelle P13.
- Le scénario visuel multi-utilisateur avec données d'équipe réelles n'a pas
  été exécuté en production : les invariants ACL/isolation sont couverts par
  les tests PostgreSQL, sans création de données QA artificielles.
- Analytics P13 : émission côté client dédupliquée par navigateur
  (localStorage) — un double tir multi-appareils reste possible ; si un jour
  PostHog serveur existe, déplacer l'émission dans le store.
