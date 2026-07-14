# Handoff — Zero niveau 8

Date: 2026-07-12 (Pacific/Tahiti)

Statut: chantier actif, non livré

Objectif: faire du fork Zero un mail OS clavier-first au moins aussi fluide que Shortwave,
mesurablement plus rapide dans les scénarios retenus, robuste sur réseau dégradé, sécurisé, et
pilotable par Codex/Claude via une surface API/MCP ouverte mais strictement draft-only.

## Point de reprise

- Dépôt principal à ne pas toucher: `/Users/thomasverdenne/cc/zero` (sale avant le chantier).
- Worktree isolé du chantier: `/Users/thomasverdenne/cc/zero-niveau8`.
- Branche: `factory/niveau8`, suivie sur `origin/factory/niveau8`.
- Ticket directeur: <https://github.com/devlab-io/zero/issues/11>.
- Spécification gelée: `docs/spec/niveau8-mailos.md`.
- Checks gelés: `docs/checks/niveau8/`.
- Éléments de preuve: `docs/research/niveau8/`.
- Dernier commit poussé avant ce handoff: `d295d8c3 security(niveau8): harden auth scopes and agent tools`.
- Commit de gel de la spec: `a9197ce4 docs(niveau8): freeze mail OS acceptance gates`.
- Tag de gel: `freeze/niveau8-v1`.

## Limites d'autorisation permanentes

Ne pas déployer, ne pas modifier la production, ne pas modifier la console OAuth, ne pas envoyer
de vrai mail et ne pas lancer de mutation sur des données réelles sans confirmation explicite de
Thomas. Un agent peut créer un brouillon ou un élément d'outbox révisable; il ne doit jamais
envoyer, supprimer définitivement, signaler comme spam ou changer les paramètres d'un compte.

## Ce qui est terminé et poussé

### Gel mesurable du produit

La spec niveau 8 et les checklists ont été gelées et enregistrées dans le ticket. Les seuils clés
sont notamment:

- retour visuel clavier p75 inférieur ou égal à 100 ms;
- ouverture du composer p75 inférieur ou égal à 150 ms à chaud;
- thread en cache p75 inférieur ou égal à 200 ms et au moins 10 % plus rapide que Shortwave;
- inbox chaude p75 inférieur ou égal à 800 ms et au moins 10 % plus rapide que Shortwave;
- aucun N+1 par ligne sur le chemin initial de l'inbox;
- INP p75 inférieur ou égal à 200 ms et CLS inférieur ou égal à 0,05;
- comparaison sur la même machine, le même navigateur et le même profil réseau, avec données
  brutes conservées.

### Vague sécurité 1

Le commit `d295d8c3` est vérifié et poussé:

- Better Auth 1.6.23, Drizzle 0.45.2, React Router 7.18.1, Hono 4.12.30 et MCP SDK 1.29.0;
- audits de production critiques ramenés de 7 à 0;
- scope Gmail complet `mail.google.com` retiré;
- union de scopes centralisée sur `gmail.modify`, `gmail.compose`, profil et email;
- revalidation du cache de session ramenée de 30 jours à 5 minutes;
- outils in-app d'envoi, suppression en masse et suppression de label retirés;
- surface MCP externe maintenue draft-only;
- assertions de surface agent, build frontend et dry-run Worker passés;
- aucun déploiement ni changement de console OAuth effectué.

Preuve détaillée: `docs/research/niveau8/security-wave-1.md`. Il reste 16 alertes basses, 77
modérées et 71 hautes à supprimer, mettre à niveau ou documenter par une décision de joignabilité
avant l'acceptation finale.

## Lot local en cours — ne pas considérer comme validé

Le worktree contient actuellement une vague clavier/réponse non commitée. Elle doit être relue,
formatée et testée avant tout commit. Fichiers concernés au moment du handoff:

- `.github/workflows/ci.yml`;
- `apps/mail/app/(routes)/mail/layout.tsx`;
- `apps/mail/components/context/command-palette-context.tsx`;
- `apps/mail/components/create/email-composer.tsx`;
- `apps/mail/components/mail/reply-composer.tsx`;
- `apps/mail/config/shortcuts.ts`;
- `apps/mail/config/shortcuts.test.ts` (nouveau);
- `apps/mail/hooks/use-mail-navigation.ts`;
- `apps/mail/lib/hotkeys/global-hotkeys.tsx`;
- `apps/mail/lib/hotkeys/mail-list-hotkeys.tsx`;
- `apps/mail/lib/hotkeys/navigation-hotkeys.tsx`;
- `apps/mail/lib/hotkeys/thread-display-hotkeys.tsx`;
- `apps/mail/lib/hotkeys/use-hotkey-utils.ts`.

Intentions déjà présentes dans ce lot:

- registre de raccourcis simplifié, alias multiples et vraies séquences temporisées `g …`;
- protection des champs, éditeurs et zones éditables contre les raccourcis à une touche;
- recherche, aide, réglages, thème, sidebar et palette de commandes câblés;
- navigation inbox/starred/snoozed/done/sent/drafts/spam/bin;
- raccourcis liste/thread pour ouvrir, fermer, archiver, lire/non lu, important, étoiler,
  sélectionner et mettre à la corbeille sans suppression définitive;
- correction du calcul des destinataires et du sujet pour reply/reply-all;
- suppression d'un provider hotkeys imbriqué en double;
- test statique de couverture du registre ajouté au CI.

État exact connu: `git diff --check` échoue uniquement sur une ligne vide finale dans
`apps/mail/config/shortcuts.ts:239`. Aucun test, lint ou build complet de ce lot n'a encore été
validé depuis les dernières modifications.

Risques connus à traiter avant de déclarer la vague terminée:

- `l` et `v` n'ouvrent pas encore les pickers label/déplacement;
- `mod+shift+Enter` (envoyer et terminer) reste à vérifier ou implémenter dans le flux humain;
- `Space` et `shift+Space` pour page suivante/précédente restent à vérifier;
- `b`/`h` utilise encore un snooze fixe plutôt qu'un picker complet;
- l'aide raccourcis redirige vers les réglages plutôt que vers une aide contextuelle;
- l'état optimiste de l'étoile dans la liste compacte est provisoire jusqu'à la projection riche;
- les raccourcis simples doivent être testés dans les dialogs et les éditeurs, pas seulement dans
  les inputs;
- les hooks de séquence doivent être profilés pour éviter des réinscriptions inutiles;
- la navigation après archive/done et les alias flèches doivent être vérifiés visuellement;
- le contrat exact `shift+?` sur macOS doit être vérifié dans le navigateur réel.

## Commandes de reprise immédiate

Depuis le worktree isolé:

```bash
cd /Users/thomasverdenne/cc/zero-niveau8
git status --short
git diff --check
```

Relire le diff puis formater uniquement les fichiers du lot. Lancer ensuite, dans cet ordre:

```bash
pnpm exec vitest run apps/mail/config/shortcuts.test.ts
pnpm dlx oxlint@latest --deny-warnings \
  apps/mail/config/shortcuts.ts \
  apps/mail/config/shortcuts.test.ts \
  apps/mail/hooks/use-mail-navigation.ts \
  apps/mail/lib/hotkeys/use-hotkey-utils.ts \
  apps/mail/lib/hotkeys/global-hotkeys.tsx \
  apps/mail/lib/hotkeys/navigation-hotkeys.tsx \
  apps/mail/lib/hotkeys/mail-list-hotkeys.tsx \
  apps/mail/lib/hotkeys/thread-display-hotkeys.tsx \
  apps/mail/components/context/command-palette-context.tsx \
  apps/mail/components/mail/reply-composer.tsx \
  apps/mail/components/create/email-composer.tsx \
  'apps/mail/app/(routes)/mail/layout.tsx'
pnpm --filter @zero/mail build
node scripts/security/check-agent-surface.mjs
git diff --check
```

Puis démarrer l'application locale, ouvrir la route inbox dans le navigateur intégré et vérifier
manuellement les raccourcis par contexte avant de commiter. Ne pousser le lot clavier qu'après un
PASS reproductible et un relevé dans `docs/research/niveau8/`.

## Plan restant

### 1. Terminer la vague raccourcis et reply/composer

- Corriger et vérifier le lot local existant.
- Implémenter les derniers équivalents Shortwave: label, déplacement, pagination, snooze picker,
  aide contextuelle et send-and-done.
- Ajouter une assertion automatisée pour chaque raccourci annoncé et tester les exclusions de
  saisie/dialog.
- Faire une QA locale clavier complète avec preuves avant/après.

### 2. Supprimer le N+1 et tenir les budgets inbox

- Construire une projection de liste riche mais compacte sans corps de messages ni pièces jointes.
- Charger au maximum la liste et le corps du thread actif sur le chemin initial.
- Réconcilier les états étoile/lu/important sans requête par ligne.
- Mesurer payload compressé, JS critique et latence d'ouverture.

### 3. Rendre les états réseau honnêtes et les brouillons durables

- Distinguer loading, empty, stale/offline et error pour inbox, recherche, thread et outbox.
- Garder la liste cache utilisable quand un rafraîchissement échoue.
- Ajouter retries bornés avec backoff et jitter sur les lectures idempotentes seulement.
- Persister le texte du brouillon avant unmount/pagehide et restaurer après reload.
- Réconcilier clairement les mutations optimistes en succès, échec et retry.

### 4. Réduire le chemin critique et durcir le sync

- Retirer markdown, highlighting, télémétrie et médias non indispensables de l'inbox initiale.
- Vérifier les limites Worker, la concurrence bornée et la progression observable du sync.
- Traiter ou documenter chaque advisory résiduel selon sa joignabilité réelle.

### 5. Finir l'API/MCP Codex et Claude en draft-only

- Exposer health/capabilities, comptes, threads compacts, thread à la demande et labels.
- Exposer création de brouillon et outbox révisable avec inspect/cancel/retry idempotents.
- Prouver qu'aucune surface ne permet send, suppression définitive, spam ou réglage de compte.
- Documenter et tester la configuration Claude Code/Desktop et Codex.

### 6. Acceptation finale niveau 8

- Lancer une QA locale visuelle et clavier sur les vrais écrans.
- Mesurer Zero et Shortwave sur la même machine avec au moins 2 warmups et 10 itérations alternées.
- Conserver median, p75, traces et données brutes dans `docs/research/niveau8/`.
- Faire un soak réseau/interruption, audit sécurité final et revue UX.
- Livrer par commits atomiques et pousser la branche; ne pas déployer sans autorisation séparée.

## Définition de fini

Le chantier n'est fini que lorsque les seuils gelés dans `docs/spec/niveau8-mailos.md` sont
mesurés et satisfaits, que tous les raccourcis annoncés sont réellement exécutables et protégés
pendant la saisie, que les états réseau ne mentent pas, que les brouillons survivent aux coupures,
que la surface agent reste draft-only, et que la comparaison Shortwave est appuyée par des données
brutes. Si la session Shortwave authentifiée est indisponible, l'acceptation comparative reste
bloquée; elle ne doit jamais être estimée.
