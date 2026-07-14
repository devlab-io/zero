# OAuth MCP live — enregistrement Codex/Claude

BASELINE: `c62c21b063ed87d788f69724eecfce1996559479`

SCOPE: rendre l'enregistrement dynamique OAuth réellement compatible avec Better Auth, appliquer
la migration Queue à la base QA locale, puis raccorder Codex et Claude sans exposer d'outil
d'envoi, suppression, spam ou réglage de compte.

## Queue locale

- Cible vérifiée avant écriture : PostgreSQL `localhost:5433/zerodotemail`.
- Migration appliquée seule et transactionnellement :
  `0038_famous_malcolm_colcord.sql` (`sha256 adc364b5…bd1`).
- Post-vérification : table `mail0_draft_outbox`, PK, FK vers `mail0_connection`, unicité de la clé
  d'idempotence et deux index présents ; `0` ligne.
- Computer Use après relance du backend : `/queue` affiche l'état vide réel
  `No draft jobs in this status`, sans `Queue could not load`.

## Défaut OAuth découvert en live

Le premier `codex mcp add zero --url http://localhost:8787/mcp` a correctement découvert OAuth,
mais l'enregistrement dynamique a échoué avant consentement : Better Auth cherchait la propriété
Drizzle `redirectUrls`, tandis que le schéma exposait `redirectURLs`.

Correction : le modèle expose maintenant `redirectUrls` tout en conservant le nom physique
historique `redirect_u_r_ls`. Aucun changement de colonne ou migration supplémentaire n'est
nécessaire. Un test de régression vérifie simultanément le contrat Better Auth et le nom SQL.

## Preuves

- Test ciblé : `1/1` vert.
- Suite complète : serveur `325/325`, mail `207/207`, total `532/532`.
- ESLint ciblé : `0` erreur.
- Prettier ciblé : vert.
- Typecheck bloquant : serveur `0`, mail `0`.
- Enregistrement dynamique réel Codex puis Claude : PASS (`applications:2`, `access_tokens:2`,
  `consents:0`). Les deux clients ont terminé OAuth automatiquement depuis la session Zero déjà
  authentifiée ; aucun écran de consentement n'a été rendu dans Chrome.
- `codex mcp list` : `zero`, Streamable HTTP, `enabled`, `OAuth`.
- `claude mcp list` : `zero`, Streamable HTTP, `Connected`.
- Configuration Codex : allowlist de onze outils draft-only et
  `default_tools_approval_mode = "writes"` ; `updateDraft` exclu tant que le provider ne prouve
  pas un CAS atomique.
- Configuration Claude : serveur `zero` ajouté au scope utilisateur ; policy locale Zero avec
  lectures autorisées, `setActiveConnection`/`createReplyDraft` en `ask`, autres outils en `deny`.
- Smoke Codex en lecture : `getServerCapabilities`, `getActiveConnection` et `listDrafts` PASS ;
  `draftOnly=true`, `canSendMail=false`.
- Smoke Claude en lecture : `getServerCapabilities` et `getActiveConnection` PASS ;
  `draftOnly=true`, compte Google actif confirmé.
- Smoke d'écriture Claude strictement borné : un seul `createReplyDraft` sur le fil QA, clé
  d'idempotence `qa-niveau10-claude-20260714-v1`, brouillon non envoyé
  `r-3874298184339802701`.
- Preuve croisée Codex : `getDraft(r-3874298184339802701)` retrouve le bon fil, le bon sujet et le
  marqueur `[TEST QA ZERO MCP — NE PAS ENVOYER]`.
- Computer Use : après `Refresh`, le brouillon apparaît en tête de `/mail/draft` à `10:03 AM` ;
  `J`, `J`, `K`, `Enter`, puis `Escape` déplacent la sélection, ouvrent exactement
  `draftId=r-3874298184339802701` et referment le composeur sans quitter Drafts.
- Computer Use final : `/queue` affiche `0 pending review` et
  `No draft jobs in this status` ; `Sent 0` reste inchangé. Les logs live ne contiennent aucun
  appel de route d'envoi et la table locale `mail0_draft_outbox` reste vide.

## Frontières

- Aucun email envoyé ou supprimé.
- Aucun outil d'envoi n'est exposé.
- Aucun déploiement ni écriture de base distante.
- Codex a terminé OAuth automatiquement depuis la session Chrome existante, sans écran de
  consentement ni clic Computer Use.
- Claude a suivi le même auto-achèvement après l'accord explicite au point d'action.
- Le front Vite historique présent sur `:3001` avait perdu ses WebSockets HMR et renvoyait `500`
  sur les imports dynamiques. Il a été redémarré depuis ce worktree avant la QA visuelle finale ;
  Inbox, ouverture du fil, Drafts, composeur et Queue sont alors tous passés.

STATUS: COMPLETE — CODEX + CLAUDE + COMPUTER USE PASS
