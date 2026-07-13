# Rulings — w2b-robustness-01 (issue #34)

Fichier append-only, propriété orchestrateur. Les juges lisent ce fichier, pas les fils.

## Ruling pré-dispatch 1 — extension may-touch : hooks/use-settings.ts (2026-07-13)

Le crash préexistant `apps/mail/hooks/use-settings.ts:11` (`session?.user.id` non gardé —
better-auth 1.6 renvoie une forme transitoire sans `user` pendant l'hydratation) a été routé
NOMMÉMENT à #34 lors de la clôture de #28 (smoke preview : seule erreur console au boot).
`hooks/use-settings.ts` est ajouté au may-touch : guard complet (`session?.user?.id`) + état
géré (pas de valeur success-shaped pendant l'indéterminé). C'est un état réseau honnête au
sens du check robustness.md.

## Ruling pré-dispatch 2 — propriété des fichiers de tests optimistes (2026-07-13)

#35 (tests-core-coverage) possède cette vague les NOMS de fichiers de tests co-localisés des
trois modules optimistes (`store/optimistic-updates.test.ts`,
`lib/optimistic-actions-manager.test.ts`, `hooks/use-optimistic-actions.test.ts`).
#34 ne crée PAS ces fichiers : ses tests comportementaux (retry policy, reprise visible,
envoi optimiste, autosave/restore) vivent dans des fichiers de test nommés d'après SES
coutures (composer, query-provider, états). Zéro collision de fichier dans la vague.
Celui de #34/#35 qui merge en second rebase et re-prouve (discipline stale-base standard).
