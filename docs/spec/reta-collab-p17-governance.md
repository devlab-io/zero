# P17 — Gouvernance d'équipe (rôles, audit signé, rétention, sessions, portabilité)

Statut : implémenté (turn reta-p17-recovery-05). Aucune dépendance externe nouvelle.

## A — Rôles et matrice de capacités

Cinq rôles : `owner`, `admin`, `member`, `guest`, `auditor`. La colonne
`team_member.role` reste un `text` sans CHECK — **zéro migration** ; l'unique
source de vérité des permissions est la matrice pure
`apps/server/src/lib/teams/team-roles.ts` (`roleCan`, `assignableRoles`,
`TEAM_VISIBILITY_ROLES`, `RESTRICTED_OVERSEER_ROLES`).

- **owner** : tout, y compris suppression d'équipe et gestion des owners.
- **admin** : gestion complète SAUF suppression d'équipe et attribution des
  rôles owner/admin (l'escalade reste aux owners).
- **member** : périmètre historique inchangé (partage, écriture de fil,
  commentaires, labels, ops.read, audit.read ; invite `member` seulement).
- **guest** : externe. EXCLU de la visibilité « team » dans `accessPredicate` —
  ne voit que les fils avec ligne `team_thread_access` active. Peut commenter,
  réagir et relire des brouillons (s'il est choisi reviewer) ; jamais partager,
  assigner, ni voir ops/audit/règles.
- **auditor** : lecture seule de supervision — visibilité équipe, ops,
  journal d'audit et son export signé. AUCUNE mutation (pas même une réaction),
  jamais reviewer, jamais assignable, pas d'absence déclarable.

Gardes structurelles (stores, prouvées sur PG) : dernier owner protégé
(`last_owner`) sous verrou `FOR UPDATE` sur les memberships — deux owners ne
peuvent pas se rétrograder simultanément —, un admin ne touche ni owner ni
admin, rétrogradation vers un rôle sans `thread.write` = désassignation
automatique des fils, et sans `draft.review` = annulation des reviews actives.
Chaque changement/retrait force la reconnexion des WebSockets du membre ; le
DO marque les sockets auditor lecture seule. Les capacités courantes sont
relues aussi sur les mutations historiques (anciens commentaires, reviews,
présence, reply intents et liens P18). Le rôle invité reste borné par
`assignableRoles(actor)` route ET store. `requireCapability` est la porte
unique ; `requireOwner` ne subsiste que pour `team.delete` et les rôles
owner/admin. Les intégrations Linear (P18) restent volontairement
**owner-only** (secrets scellés, install liée au compte Linear de l'owner).

## B — Export signé du journal d'audit

`teams.exportAudit` (capacité `audit.export` : owner/admin/auditor). Payload
borné (5 000 entrées + drapeau `truncated`, fenêtre from/to), chronologique,
acteurs système inclus. Signature HMAC-SHA256 sur la sérialisation **canonique**
(clés triées récursivement) avec clé dérivée du ring KEK serveur par
HKDF-SHA256 (info dédiée `reta:team-audit-export:v1` — jamais le KEK brut).
Le document embarque `kekVersion` : un export ancien reste vérifiable après
rotation tant que sa version est dans le ring. Sans ring : fail closed
`PRECONDITION_FAILED`. Vérification serveur : `teams.verifyAuditExport`
(comparaison en temps constant via `crypto.subtle.verify`). Chaque export est
lui-même audité (`audit.exported`).

## C — Rétention bornée + sweep planifié

Table `team_retention_policy` (migration 0047, curseur `last_swept_at` ajouté
par 0048 après revue indépendante) : trois familles en jours —
`audit_days`, `rule_run_days`, `notification_days` — chacune nullable
(= conserver) et bornée **30..730** par CHECK SQL ET par le store. Écriture
`team.manage`, lecture `audit.read`, auditée (`retention.policy_set`).

Sweep : `runTeamRetentionSweep` branché dans `runScheduledTasksIsolated`
(main.ts scheduled). Par run : ≤200 équipes, choisies `NULLS FIRST` puis par
plus ancien `last_swept_at` — aucune famine au-delà de la 200e politique,
prouvé sur 201 équipes. ≤2 000 lignes par famille par équipe (le reliquat part
au run suivant, loggé — jamais silencieux). Purge +
entrée d'audit `retention.swept` (actor system) en UNE transaction par équipe.
Les runs de règles `processing` (claims vivants) ne sont JAMAIS purgés.
Nuance assumée : purger un run `applied`/`undone` au-delà de la fenêtre
libère le verrou d'idempotence (règle, fil) — une règle peut rejouer un très
vieux fil s'il redevient actif ; c'est le prix explicite de la rétention,
documenté ici et borné à ≥30 jours. Le sweep moissonne aussi les
`team_reply_intent` expirés depuis plus de 7 jours (reste P15 soldé).

## D — Sessions/appareils révocables

Routes `user.listSessions` / `user.revokeSession` / `user.revokeOtherSessions`
— exclusivement via l'API better-auth (jamais un DELETE SQL : le
`secondaryStorage` KV/Redis doit être invalidé avec Postgres). Le token de
session ne quitte JAMAIS le serveur : le client manipule des ids ; la
résolution id→token est serveur, scopée à la session appelante par
construction. Fenêtre résiduelle de révocation bornée à 5 minutes par le
cookieCache (config existante). UI : Réglages → Sécurité (appareil courant
marqué, révocation unitaire et globale).

## E — Export / restauration de données d'équipe

`teams.exportData` (capacité `data.export` : owner/admin, audité) : document
versionné `reta-team-export` v1 — équipe, membres (rôles+prefs), labels, fils
partagés (métadonnées + liens labels + ACL active, SANS `sharerConnectionId`),
commentaires+réactions, règles (avec `watchedEmail`), politiques SLA et
rétention, absences futures. Bornes nommées dans `truncated` ; exclusions
structurelles nommées dans `excluded` (audit → export signé dédié ;
intégrations → secrets scellés non exportables ; état éphémère P15 ;
notifications/presence ; rule runs).

`teams.restoreData` : validation zod stricte aux bornes de l'export, puis plan
PUR (`planTeamRestore`) exécuté en UNE transaction. La restauration crée
TOUJOURS une **nouvelle équipe** (jamais d'écrasement) ; l'appelant devient
owner, les owners exportés redescendent admin ; utilisateurs vérifiés par
id ET email (anti-réutilisation d'id). Un fichier d'export n'est JAMAIS un
bearer token vers les boîtes : l'appelant doit encore porter `data.export` sur
l'équipe source, les membres doivent encore en faire partie, et chaque fil /
règle est comparé à sa ligne source autoritative avant qu'une connexion soit
re-résolue. Toute divergence est écartée et NOMMÉE dans le rapport. Les règles
sont restaurées **désactivées** (ré-armement ACL avec
confirmation fraîche P14) ; l'audit n'est jamais restauré — une entrée
`team.restored` porte le digest SHA-256 canonique du document source.
Round-trip prouvé sur PostgreSQL réel (team-governance-pg.test.ts).

## Différés — explicitement hors périmètre sans prospect réel

- **SAML / SSO d'entreprise** : aucun prospect ne l'exige. Le jour venu :
  plugin better-auth `sso` (SAML 2.0/OIDC), table de config IdP par domaine,
  enforcement à l'acceptation d'invitation. Ne rien pré-construire — le choix
  d'IdP du premier client réel dictera le mapping d'attributs.
- **SCIM (provisioning/déprovisioning)** : dépend de SAML et d'un annuaire
  client réel. L'API interne est déjà compatible (membership par userId,
  rôles texte) ; un connecteur SCIM serait une façade REST au-dessus de
  `setMemberRole`/`removeTeamMember`.
- **Legal hold** : la rétention P17-C sait déjà « conserver indéfiniment »
  (politique nulle). Un hold juridique (gel par fil/équipe outrepassant la
  purge + export scellé) n'a de forme sérieuse qu'avec une exigence légale
  concrète d'un client — différé.

## Preuves (2026-08-03, revue indépendante Codex)

- Suites ciblées : P17 107/107 (dont 16 PG gouvernance rollback), pont P18
  50/50 (dont 13 PG), landing/roles UI 14/14.
- Gates exhaustifs : serveur 102 fichiers / 1116 tests, mail 133 / 840 ;
  typechecks serveur + mail à 0 ; ESLint à 0 erreur (85 avertissements mail
  historiques) ; build production vert, preload 6 modules / 89 KiB gzip sous
  les budgets 10 / 90 ; `db:generate` = « No schema changes ».
- Chaîne Drizzle 0000→0049 appliquée depuis une base vide sur
  `zero_reta_final_verify_2366_20260803` (50 entrées journalisées) ; colonnes
  0048/0049 et trois CHECKs 30..730 vérifiés. La progression de 201 équipes est
  prouvée par le test PG.
