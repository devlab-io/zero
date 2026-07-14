# Accessibilité UX — polish Computer Use

ISSUE: `#52`

BASELINE: `38fbd7b188b2390d078b8e6af11c36535fa4acde`

SCOPE: correction des trois catégories remontées par Lighthouse sur l'inbox locale authentifiée ;
aucune modification API, provider, base de données, OAuth, envoi ou déploiement

## Baseline Computer Use

- Lighthouse local : accessibilité `90`, bonnes pratiques `92`, SEO `92`, CLS `0`.
- Constats retenus : boutons icon-only sans nom accessible, absence de landmark `main`, titre et
  description vides dans le dialog du composeur.
- Le score performance du build de développement n'est pas utilisé comme preuve produit.

## Corrections

- Les routes mail et queue exposent chacune un unique landmark `<main id="main-content">`.
- Le composeur fournit un `DialogTitle` et une `DialogDescription` localisés, non vides et réservés
  aux technologies d'assistance.
- Le déclencheur du composeur, le rafraîchissement, la fermeture de l'upgrade, l'ajout de label, la
  bascule de sidebar et les contrôles de compte icon-only ont un nom accessible localisé.
- Les sélecteurs de compte cliquables utilisent des éléments `<button type="button">` natifs.
- Les tests DOM figent le landmark, l'absence de titre vide et les noms accessibles critiques.

## Preuves mécaniques séquentielles

### Suite complète

COMMAND: `pnpm test`

EXIT: `0`

RESULT:

```text
@zero/server:test: Test Files  27 passed (27)
@zero/server:test: Tests       324 passed (324)
@zero/mail:test:   Test Files  30 passed (30)
@zero/mail:test:   Tests       199 passed (199)
Tasks: 2 successful, 2 total
TOTAL: 523/523 tests
```

Les avertissements `KeyboardLayoutMap API is not supported` et les logs du scénario de retry
optimiste sont le bruit de test attendu et ne produisent aucun échec.

### Lint ciblé

EXIT: `0`

RESULT: `0` erreur, `4` warnings `react-hooks/exhaustive-deps` hérités dans `mail.tsx`,
`nav-main.tsx` et `nav-user.tsx`.

### Typecheck bloquant

COMMAND: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter
@zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node
scripts/checks/typecheck-report.mjs`

EXIT: `0`

RESULT: `server: 0 errors`, `mail: 0 errors`.

### Build mail

COMMAND: `pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build`

EXIT: `0`

RESULT: build client et SSR vert, `0` erreur, `3` warnings Oxlint hérités.

### Hygiène du diff

COMMAND: `git diff --check`

EXIT: `0`

Un essai antérieur lançant simultanément les tests mail et le build a provoqué une course sur les
fichiers générés Paraglide. Cette exécution n'est pas retenue comme preuve ; toutes les preuves
ci-dessus ont été rejouées séquentiellement avec succès.

## Frontières conservées

- Aucun appel fournisseur, envoi ou suppression d'email.
- Aucun consentement OAuth persistant Codex/Claude.
- Aucune migration ou écriture de base de données.
- Aucun déploiement.
- Le rejeu Lighthouse/Computer Use après intégration est une étape de validation distincte.

STATUS: MECHANICAL PASS — COMPUTER USE PENDING
