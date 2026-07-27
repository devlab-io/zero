# ADR 0011 — Driver Microsoft/Outlook gelé, avec exception loc-ratchet

- **Statut :** Accepté
- **Date :** 2026-07-14
- **Issue :** devlab-io/zero#23 (refactor-google-driver) — périmètre driver
- **Périmètre :** `apps/server/src/lib/driver/microsoft.ts`. Aucune modification du fichier.
- **Lié à :** `scripts/checks/loc-ratchet.mjs` (borne + pointeur ADR), `ARCHITECTURE.md` §4.

## Contexte

Le driver de messagerie a deux implémentations de `MailManager` : **Gmail** (Google, éclaté en
~19 modules `lib/driver/google*.ts` / `gmail-*.ts` lors de #23) et **Outlook**
(`OutlookMailManager`, `lib/driver/microsoft.ts`, **1291 LOC**). Le chemin **activement développé**
et mesuré du run est Gmail (sync, projection, hot-path #36, N+1 tués). Le driver Outlook existe mais
n'est pas sur le chemin critique.

`microsoft.ts` dépasse le seuil loc-ratchet A1 (800/fichier). Le découper « pour la métrique » sans
travail produit derrière serait du gaming (voir `docs/solutions/anti-metric-gaming.md`) : un refactor
non couvert par des tests d'un driver non prioritaire est un risque net, pas un gain.

## Décision

- **Geler `microsoft.ts` en l'état** : ne pas l'éclater ni le réécrire dans ce run. Le driver Outlook
  reste présent et fonctionnel, mais **non first-class**.
- **Exception loc-ratchet explicite et tracée.** `scripts/checks/loc-ratchet.mjs` porte une borne
  dédiée : `'apps/server/src/lib/driver/microsoft.ts': 1294, // ADR: driver Microsoft`, avec le
  commentaire « covered by the driver ADR ». La borne est **non-croissante** (le fichier ne peut pas
  grossir) mais n'exige pas le passage sous 800 ; le présent ADR est la couverture référencée.

## Conséquences

- **+** Pas de refactor risqué d'un driver hors chemin critique sans filet de test.
- **+** loc-ratchet reste vert **honnêtement** : l'exception est nommée, bornée et pointée vers cet
  ADR — pas un contournement silencieux.
- **− (conséquence produit)** Outlook reste une implémentation gelée : toute évolution
  fonctionnelle Outlook nécessitera d'abord de lever ce gel (découpe sous test) via un ADR de
  révision. Le support Outlook n'est donc pas au niveau de parité de Gmail tant que ce gel tient.

## Amendement — 2026-07-25 (run pitbull, axe 9)

**Constat.** La borne posée ci-dessus (1294) est rouge depuis le commit `d689e507`
(`perf(server): sortir les deps lourdes du graphe statique`) : `microsoft.ts` mesure
**1312 LOC**. La CI de `staging` échoue donc au step loc-ratchet depuis quatre pushes, ce qui
empêche l'exécution des steps suivants (build, bundle worker, gitleaks). L'ADR affirmait par
ailleurs « aucune modification du fichier », ce que ce commit a contredit.

**Décision.** La croissance est **assumée, pas annulée**. Les +21 lignes viennent de la
conversion des imports lourds (`@microsoft/microsoft-graph-client`, `mimetext`) en imports
dynamiques aux points d'usage : le corps du module n'est plus évalué au démarrage de l'isolate.
Revenir en arrière pour satisfaire un chiffre régresserait le temps de démarrage à froid mesuré
(axe 6) au bénéfice d'une métrique — exactement ce que `docs/solutions/anti-metric-gaming.md`
proscrit. La borne passe donc à **1312**, la valeur mesurée, et reste **non-croissante** à partir
de là.

**Périmètre révisé.** Le gel porte désormais sur la _forme_ du driver (pas de découpe ni de
réécriture fonctionnelle sans filet de test), non sur son immutabilité littérale : les
modifications transverses et mesurées à l'échelle du dépôt (perf, sécurité, correctifs de
typage) restent recevables, à condition de mettre la borne à jour dans le même commit et de
justifier ici. Toute évolution _fonctionnelle_ d'Outlook exige toujours de lever le gel via un
ADR de révision.
