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

## Rulings PHASE 0 (orchestrateur, 2026-07-13)

- **D1 APPROUVÉ** — verify-don't-build sur l'idempotence outbox : évidence citée
  (onConflictDoNothing idempotencyKey, UPDATE gardé par statut, tests state-machine
  existants). Serveur intouché, aucune attente de ruling.
- **D2 STATUÉ** — `use-threads.ts:82` CONFIRMÉ in-scope (data-layer thread, porte l'état
  honnête du point 3). `use-drafts.ts:11` : may-touch ÉTENDU à #34 (ruling 3) — même
  guard une-ligne que use-settings, aucun autre job V5 ne touche les hooks mail,
  zéro collision. Les trois guards jumeaux vivent dans la même livraison.
- **D3 APPROUVÉ** — le check gelé robustness.md (arbitre binaire) exige « recovery
  action + reconciles cache state », PAS la fermeture-avant-await littérale (formule
  de la spec W2-H, pas du check). La variante sûre est retenue : retrait de l'await
  refetch() bloquant (le gain mesuré), état « Envoi… », fermeture sans attente réseau
  dans le chemin de fermeture au-delà de la résolution du send, cycle de vie éditeur
  préservé. Si la latence du send nu se révèle visible au soak, le détachement via la
  couture composer-flush est la suite naturelle — non exigé cette vague.
- **D4/D5 APPROUVÉS** — coutures pures sous contrainte LOC ; soak automatisé
  déterministe conforme au libellé du check (« automated OR browser fault injection »),
  log conservé exigé.
