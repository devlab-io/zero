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
- Enregistrement dynamique réel Codex : PASS (`applications:1`, `access_tokens:1`).
- `codex mcp list` : `zero`, Streamable HTTP, `enabled`, `OAuth`.
- Configuration Codex : allowlist de onze outils draft-only et
  `default_tools_approval_mode = "writes"` ; `updateDraft` exclu tant que le provider ne prouve
  pas un CAS atomique.
- Configuration Claude : serveur `zero` ajouté au scope utilisateur ; policy locale Zero avec
  lectures autorisées, `setActiveConnection`/`createReplyDraft` en `ask`, autres outils en `deny`.

## Frontières

- Aucun email envoyé ou supprimé.
- Aucun outil d'envoi n'est exposé.
- Aucun déploiement ni écriture de base distante.
- Codex a terminé OAuth automatiquement depuis la session Chrome existante, sans écran de
  consentement ni clic Computer Use.
- Le login Claude et le smoke live draft-only restent en attente d'une confirmation au point
  d'action, car le même auto-achèvement est possible.

STATUS: CODEX PASS — CLAUDE CONSENT PENDING
