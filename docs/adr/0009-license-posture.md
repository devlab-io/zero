# ADR 0009 — Posture de licence du fork (préservation des en-têtes, posture prudente)

- **Statut :** Accepté
- **Date :** 2026-07-14
- **Issue :** devlab-io/zero#13 (AS-2) — porté par #39 (V6.1 docs-governance)
- **Périmètre :** posture de conformité du fork `devlab-io/zero` vis-à-vis de l'upstream
  `Mail-0/Zero`. Aucun changement de code. **Aucune conclusion juridique** n'est tirée ici.
- **Lié à :** `LICENSE-NOTES.md` (inventaire + mapping + plan de sortie), `FORK.md`, `README.md`.

## Contexte

Ce dépôt est un fork de `Mail-0/Zero`. Trois éléments coexistent (constatés, non tranchés) :

- la racine est sous **MIT** (`LICENSE`, `Copyright (c) 2025 Zero Email`) ;
- **20 fichiers** serveur/mail portent un en-tête référençant l'**Apache License 2.0** **assorti
  d'une clause additionnelle restrictive**, citée verbatim :
  > `Reuse or distribution of this file requires a license from Zero Email Inc.`
- un pied de page produit (`footer.tsx`) affiche `© 2025 Zero Email Inc, All Rights Reserved` —
  **branding** distinct de la question de licence.

Au point de coupe du run (`23359642`), 9 fichiers correspondaient à « Zero Email Inc » (7 en-têtes +
2 mentions) ; le HEAD en compte 22 après les éclatements du run — inventaire et mapping dans
`LICENSE-NOTES.md`. L'axe conformité (A10) exige une **posture documentée**, pas une réécriture
clean-room ni une conclusion sur la portée de la clause.

## Décision

- **Ne pas réécrire** clean-room les fichiers porteurs d'en-tête pendant le run.
- **Préserver l'en-tête verbatim, clause restrictive comprise, sur tout module dérivé** (règle
  appliquée lors des éclatements #22 DO agent et #36 surface MCP : les originaux survivent, plus 13
  descendants portant l'en-tête ET la clause — `LICENSE-NOTES.md` §3-4).
- **Ne pas trancher** ici la portée ou le conflit éventuel entre l'en-tête Apache 2.0, la clause
  additionnelle et le MIT racine : cela relève d'une revue juridique.
- **Posture opérationnelle stricte** : PAS de redistribution, PAS de relicensing, PAS de stripping de
  ces fichiers **sans permission écrite d'upstream (`Zero Email Inc.`) OU une revue juridique**.
- **Documenter** un plan de sortie chiffré (permission/accord upstream ou réécriture clean-room,
  précédé d'une revue juridique) — `LICENSE-NOTES.md` §5-6.

## Conséquences

- **+** L'axe conformité est satisfaisable littéralement : les fichiers porteurs de la clause
  restrictive sont inventoriés, la clause est citée verbatim, l'écart 9 → 22 est justifié par lignée.
- **+** Les en-têtes (Apache 2.0 + clause) sont préservés intacts sur tous les modules dérivés.
- **−** La posture stricte contraint Devlab : ces 20 fichiers ne peuvent pas être redistribués,
  relicenciés ou dépouillés de leur en-tête sans permission écrite upstream ou revue juridique — tant
  que la portée de la clause n'est pas clarifiée par cette voie.
