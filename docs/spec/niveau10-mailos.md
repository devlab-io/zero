# Spec — Niveau 10 : mail OS clavier, API agent exploitable et UX de confiance

Run: `niveau10` · Base: `origin/main@bc3dab47` · Date: 2026-07-14

## Goal

Faire de Zero un mail OS réellement opérable au clavier, agréable sur desktop et mobile,
et pilotable depuis Codex ou Claude pour le cycle **lire → comprendre → préparer un
brouillon → relire → corriger**, sans jamais donner à l'agent le pouvoir d'envoyer.

Le run doit livrer un parcours cohérent et démontré de bout en bout : connexion OAuth
MCP, sélection fiable du compte, recherche et lecture de fils, création ou réponse en
brouillon, relecture et correction du même brouillon, revue dans Zero, raccourcis à effet
observable, puis vérification UI authentifiée.

## Non-goals et limites d'autorité

- Aucun outil agent ne peut envoyer, approuver un envoi, supprimer définitivement,
  signaler comme spam ou modifier les réglages du compte.
- Aucun déploiement, mutation de production, envoi d'email ou création de credential
  persistant sans autorisation explicite supplémentaire de Thomas.
- Pas de rebrand ni de remplacement de Geist ; le travail visuel prolonge le système
  existant avec des tokens, des états et des primitives cohérentes.
- Pas de cherry-pick global du worktree sale `zero-niveau8` : seules des idées précises
  peuvent être réimplémentées avec les coutures et tests actuels.
- Pas de refonte du hot path serveur de liste dans le seul but d'améliorer les skeletons.

## Assumptions retenues

1. « Générer mes mails depuis Codex ou Claude » signifie une intégration MCP distante
   draft-only couvrant les lectures nécessaires et la gestion révisable des brouillons.
2. Claude signifie d'abord Claude Code et le connecteur MCP distant hébergé ; la doc
   Desktop doit suivre le parcours actuel « Settings > Connectors ».
3. `origin/main` est la base de vérité ; `factory/perf` est un run fermé et ne reçoit
   aucun changement de produit.
4. UX signifie d'abord vérité fonctionnelle, accessibilité, feedback immédiat et
   responsive ; le polish arrive après les contrats d'interaction.
5. La vérification finale utilise une session authentifiée et un jeu de données non
   destructif. Aucun message n'est envoyé pendant le smoke.

## État constaté au départ

### Raccourcis et navigation

- Le binder réduit les raccourcis par identifiant d'action : les alias ultérieurs
  écrasent les précédents. `d`, `b`, `u`, `#`, `Delete` et `Shift+?` sont notamment
  morts alors que le registre les annonce.
- `+`, `Mod+,` et `Shift+?` entrent en collision avec le parseur chaîne actuel ; le
  mapping `# → Shift+3` est QWERTY-spécifique.
- `Escape` du composeur est routé vers le mauvais état et bloqué dans l'éditeur.
- Le registre prouve aujourd'hui qu'un handler est déclaré, pas qu'un vrai
  `KeyboardEvent` produit l'effet utilisateur.
- `/` n'ouvre pas directement la recherche ; Enter peut lancer l'IA par défaut ; les
  résultats rapides utilisent un champ et une route obsolètes.
- Après une archive, le calcul du fil suivant peut sauter une ligne ; le feedback
  « important » peut annoncer un échec après succès.

### API agent / MCP

- La surface v1.1.0 offre 18 outils draft-only, mais Zero n'est configuré dans aucun
  des clients Codex/Claude de la machine et aucun smoke HTTP authentifié réel n'existe.
- `/mcp` renvoie 401 sans `WWW-Authenticate`; le protected-resource metadata manque.
  La documentation Codex demande une configuration OAuth/approbation explicite, et
  Claude demande une découverte OAuth de ressource protégée pour un serveur distant.
- Les erreurs d'auth peuvent journaliser le header `Authorization`.
- `setActiveConnection` change un identifiant mais les handlers continuent d'utiliser
  l'agent construit pour la première connexion.
- `createDraft` accepte une clé d'idempotence facultative et son cycle get/create/put
  n'est pas atomique.
- Il manque le cycle de révision : contexte complet, réponse serveur-safe, liste,
  lecture et mise à jour d'un brouillon existant.
- Les schémas ne bornent pas assez les emails, tailles, CRLF, destinataires et limites.

### UX

- Les états de chargement du corps et du reply composer peuvent laisser une zone vide.
- Le composeur utilise des largeurs fixes, retire des contrôles du tab order et rend
  mal l'état réel de sauvegarde/échec.
- Les lignes inbox et leurs actions ont une sémantique clavier et des cibles tactiles
  insuffisantes ; l'état vide ne distingue pas boîte vide et filtre sans résultat.
- La queue n'a pas de navigation `j/k`, de pending par ligne ni de vraie barre d'action
  mobile ; ses raccourcis vivent hors du registre global.

## Architecture et contrats

### 1. Contrat clavier canonique

- Le registre conserve toutes les variantes d'une action au lieu de les indexer par
  action unique.
- La représentation d'une touche sépare `key`, `code` et modificateurs ; aucune
  ponctuation n'est sérialisée dans une mini-grammaire ambiguë.
- La matrice supporte QWERTY et AZERTY pour les actions de ponctuation.
- Les scopes définissent explicitement les exceptions autorisées dans input,
  contenteditable et dialog. `Escape` est géré par un cycle de fermeture commun aux
  nouveaux messages, réponses et transferts, avec garde brouillon unique.
- `?` ouvre une aide contextuelle, humaine et localisée, sans quitter l'inbox.
- Les préférences ne ressemblent plus à des boutons inertes : personnalisation
  persistée, détection des collisions et reset, ou affordance retirée si le contrat
  complet n'est pas livrable dans la tranche.
- Les raccourcis de queue rejoignent ce registre avant le travail visuel de la queue ;
  `keyboard-runtime` possède cette migration et `ux-trust` la consomme ensuite.

### 2. Recherche et triage fiables

- `/` place le focus dans une recherche lexicale locale ; l'appel IA est toujours un
  choix explicite.
- Les résultats rapides consomment la projection `sender` et naviguent vers
  `/mail/inbox?threadId=…`.
- « Effacer les filtres » nettoie recherche, labels, catégorie et persistance locale.
- Archive/snooze/navigation calculent le successeur par identifiant avant mutation,
  resynchronisent focus et URL, et ferment déterministement le dernier fil.

### 3. MCP OAuth et frontière de sécurité

- Publier OAuth authorization-server **et** protected-resource metadata pour l'URL MCP
  exacte ; chaque 401 `/mcp` fournit un `WWW-Authenticate` exploitable.
- Ne jamais journaliser bearer, cookie, corps de mail ou secret ; les erreurs conservent
  seulement une cause et des métadonnées non sensibles.
- Résoudre le driver/agent au point d'utilisation depuis `activeConnectionId`, toujours
  borné par `userId`. Le lifecycle DB supporte une session MCP multi-appels.
- Ajouter des instructions serveur courtes et autonomes dans leurs 512 premiers
  caractères, ainsi que des annotations read-only / destructive / idempotent fidèles.

Références officielles :

- Codex MCP : <https://developers.openai.com/codex/mcp>
- Claude Code MCP : <https://code.claude.com/docs/en/mcp>
- OAuth connecteurs Claude : <https://claude.com/docs/connectors/building/authentication>

### 4. API de brouillons révisables

La surface cible ajoute au minimum :

- `getThreadContext` : historique textuel sanitaire et borné, sans pièce jointe brute ;
- `createReplyDraft` : destinataires, threading et sujet dérivés côté serveur ;
- `listDrafts` : projection bornée des brouillons du compte actif ;
- `getDraft` : contenu et destinataires d'un brouillon détenu ;
- `updateDraft` : modification conditionnelle du même draft avec contrôle de révision.

Toutes les mutations exigent une clé d'idempotence de 1 à 128 caractères. Une réservation atomique associe
clé, connexion et hash du payload : même clé/même payload déduplique ; même clé/payload
différent retourne un conflit. Les validations bornent emails, CRLF, nombres de
destinataires (50), longueur de sujet (998 caractères), corps (2 Mio), requête
(2 048 caractères) et tailles de pages (1 à 50, entiers) avant tout appel driver.

`getThreadContext` retourne au plus 20 messages et 64 Kio de texte après passage par
`sanitizeMailContent`. `updateDraft` exige une révision opaque issue de `getDraft` ; une
révision périmée ne modifie rien.

`composeEmail` décrit clairement l'egress vers le fournisseur IA et rend la recherche
web explicite. Aucun nouvel outil ne contient send/approve/delete/spam/settings.

### 5. UX de confiance

- Inbox : lignes sémantiques et nom accessible, actions visibles au focus, contraste AA,
  cibles ≥40 px desktop et ≥44 px mobile, états vides différenciés.
- Lecture : skeleton stable, corps en attente/erreur/retry, contenu stale conservé quand
  possible, aucun fallback `null` pour le reply composer.
- Composer : largeur fluide et safe-area, contrôles Cc/Bcc/fermer dans le tab order,
  titre/description accessibles, actions sticky mobile, état distinct « local »,
  « serveur », « échec — réessayer », aucune perte silencieuse.
- Queue : navigation `j/k` et flèches, Enter/Space, pending par item, actions tactiles,
  barre mobile sticky, IDs techniques derrière « détails », compteur tabulaire.
- Polish : primitives `Button`, tokens sémantiques, rayons concentriques, ombres
  réservées à l'élévation et transitions limitées aux propriétés réellement animées.

## Découpage de livraison

1. `keyboard-runtime` — binder, ponctuation/layout, scopes, fermeture composer,
   destinataires reply et tests comportementaux.
2. `search-triage` — recherche directe, palette, reset filtres, navigation post-action ;
   bloqué par `keyboard-runtime` et propriétaire final des fichiers de liste/thread.
3. `mcp-foundation` — discovery OAuth, 401, logs, multi-compte, lifecycle, schémas et
   idempotence atomique.
4. `mcp-draft-loop` — cinq outils de révision, annotations/instructions, drivers, docs et
   smoke clients (bloqué par `mcp-foundation`).
5. `ux-trust` — états de latence, composeur responsive, inbox accessible et queue clavier
   (bloqué par `search-triage`, qui est lui-même bloqué par `keyboard-runtime`).
6. `final-qa` — checks complets, smoke MCP local/authentifié, Computer Use desktop/mobile,
   captures et digest. Aucun déploiement implicite.

## Critères d'acceptation globaux

- Chaque variante de raccourci déclarée déclenche exactement une fois le bon handler
  dans le bon scope ; aucun raccourci simple ne fuit dans input/editor/dialog.
- `d/e`, `b/h`, `u/Shift+U`, `#/Delete/Mod+Backspace`, `+`, `Mod+,`, `Shift+?`,
  `g !` et `g #` sont couverts par événements réels QWERTY/AZERTY.
- `/` ouvre une recherche focusée en <100 ms cache chaud et aucun appel IA n'est lancé
  sans choix explicite.
- Sur jeux de 1, 2 et 20 fils, les actions successives ne sautent ni ne doublonnent un
  fil et gardent focus/URL synchrones.
- Le serveur et les configs sont prêts pour Codex et Claude Code ; le login MCP réel et
  le connecteur hébergé sont validés après la confirmation obligatoire au moment du
  consentement OAuth interactif. Avant cette confirmation, le smoke HTTP local reste
  obligatoire mais n'est jamais présenté comme une preuve live.
- Une bascule compte A→B s'applique à list/get/create/update ; un compte tiers est
  indistinguable d'un compte absent ; 25 appels d'une session n'utilisent pas une DB
  fermée.
- 20 appels concurrents avec même clé/payload créent un seul brouillon ; une réutilisation
  avec payload différent échoue sans mutation.
- Le cycle agent crée une réponse draft, relit puis met à jour le même Gmail draft ID ;
  une révision obsolète est refusée ; le compteur `Sent` reste strictement inchangé.
- Aux tailles 390×844, 768×1024 et 1440×900 : pas d'overflow, feedback visible <100 ms,
  CLS <0,05 sur ouverture, Tab logique, Axe sans violation critique.
- Tests, lint/typecheck ciblés, build mail/server, contrôle de surface agent, smoke MCP et
  `git diff --check` sont verts avant intégration et push.

## Validation et preuve finale

Les checks propres à chaque slice sont gelés sous `docs/checks/niveau10/` avant tout
dispatch. Les builders ne modifient ni la spec ni les checks. Chaque slice reçoit un
rapport, une exécution mécanique enregistrée et un jugement indépendant.

Le smoke final prépare un brouillon identifiable, le relit, le corrige et le retrouve
dans Zero. Il prend un compteur `Sent` avant/après et exige delta 0. La vérification UI
se fait par Computer Use sur un compte de test/non destructif, y compris les effets
réels des touches — jamais seulement la présence d'un handler.

## Approval record

- 2026-07-14 — Autorisation in-session de Thomas Verdenne, VERBATIM :
  « /goal j'ai lancé ce projet je veux que tu le suivent et ensuite une fois que c'est
  livré push toi même et va vérifier avec computer use que tout est fonctionnel j'ai
  aussi un souci j'ai l'impression que les shortcuts ne fonctionnent pas dans zéro et
  je veux grandement développer les api de zéro pour pouvoir générer mes mails depuis
  codex ou claude je veux aussi faire un gros travail sur la partie ux de zéro »

Cette autorisation couvre l'implémentation, les tests, commit et push de la branche de
factory. Elle ne couvre pas un déploiement, un envoi de mail ou un consentement OAuth
persistant supplémentaire.
