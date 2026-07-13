# Protocole M1 — mesure authentifiée (session manuelle avec Thomas, ~1 h)

*Run `perf` · Fixe les axes 4 (ouverture de fil) et 8 (sync initiale) du barème
(`docs/spec/perf-9sur10.md`). Reprend les protocoles B0/B1
(`docs/research/perf-baseline.md`) pour comparabilité. Cible :
staging live `zero-staging.devlab-tahiti.workers.dev` +
`zero-server-staging.devlab-tahiti.workers.dev`, session Google de Thomas.*

## Conditions à consigner (identiques B1)

Date/heure locale, poste, réseau (`en0`, WARP on/off + colo via `/cdn-cgi/trace`),
RTT ICMP 1.1.1.1 (min/moy/max, 10 pings), état du cache navigateur (préciser
froid = fenêtre privée neuve / chaud = session existante).

## 1. Ouverture de fil (axe 4)

Chrome DevTools, onglet Network + Performance, session authentifiée :

1. **Liste froide** : fenêtre privée → login → `/mail/inbox`. Consigner :
   nombre de requêtes tRPC au premier rendu (compter les `mail.get` — c'est la
   preuve directe du N+1), octets transférés totaux, temps jusqu'à liste
   interactive (perçu, chronométré à l'écran).
2. **Ouverture de fil froid** (fil jamais ouvert, avec images) : clic → temps
   jusqu'au corps affiché. Répéter sur 5 fils variés (court texte, long
   HTML, avec pièces jointes). Médiane retenue.
3. **Ouverture de fil chaud** (fil déjà ouvert, cache persist) : re-clic après
   navigation ailleurs. 5 échantillons, médiane.
4. **Payload `mail.get` moyen** : DevTools, taille de réponse des 5 fils
   ci-dessus (brut + transféré). Noter le max.
5. **Hyperdrive froid/chaud** : après > 60 s d'idle, une action authentifiée
   traversant PG (chargement settings / labels) ; TTFB DevTools vs répétition
   immédiate. 3 paires.

## 2. Sync initiale (axe 8)

1. Compte de test (ou re-sync forcée d'une connexion existante — décision
   Thomas en séance) : chronométrer la sync complète 2000 threads (timestamp
   début/fin depuis les logs `wrangler tail` du worker staging).
2. Consigner depuis les logs : nombre d'appels Gmail API, nombre de 429/erreurs,
   backoffs déclenchés.
3. Si `wrangler tail` indisponible en séance : chronométrage écran (progression
   visible) + export des logs d'observabilité a posteriori.

## Livrable

`docs/research/perf-m1.md` : conditions, tableaux (médiane par mesure),
notes révisées des axes 4 et 8 avec justification chiffrée, et liste de ce qui
resterait non mesurable. Committé sur `factory/perf` en evidence.

## Ce que M1 ne fait pas

Aucun redéploiement, aucune modification de code ou de données pendant la
mesure (lecture seule + navigation normale). Le hard stop `wrangler deploy`
reste absolu.
