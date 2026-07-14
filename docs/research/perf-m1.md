# Rapport M1 — mesure staging (run perf → certification niveau9)

*Protocole : `docs/spec/perf-m1.md`. Statut : **partie non authentifiée LIVRÉE ;
sections authentifiées PENDING** (session Google requise — import cookies armé,
sera complété dès disponibilité). Publié partiel volontairement, à la manière
des sections BLOCKED de B0/B1 : aucune mesure inventée.*

## Conditions (2026-07-12, 21:45–22:00 UTC-10)

| Condition | Valeur | B1 (référence) |
|---|---|---|
| Réseau | fixe Tahiti, `en0`, **warp=off** | warp=on (tunnel) |
| Colo Cloudflare | **PPT (Papeete)** | SYD (Sydney) |
| RTT ICMP 1.1.1.1 | min 17,8 / moy 25-30 / max 35 ms | 119-183 ms |
| Front déployé | bundle **post-P0** (plus gros chunk servi : `page-Be-21blT.js` 132 624 o zstd) | pré-P0 (use-drafts 383 kB zstd) |

**Constat structurel : les prémisses réseau de B1 ne tiennent plus.** Le trafic
sort désormais par un colo local (PPT) sans tunnel WARP : RTT ÷5, TTFB ÷5,
débit ×2 à ×17. Toute cible « depuis Tahiti » doit consigner warp on/off +
colo ; la variance inter-conditions dépasse la variance inter-fenêtres de B1.

## 1. Réseau non authentifié — 2 fenêtres (21:45 et 21:59)

**TTFB API `/api/public/providers`, connexions fraîches :**
- Fenêtre 1 : 0,138 / 0,126 / 0,118 / 0,113 s
- Fenêtre 2 (dont 1ᵉʳ hit post-idle 10 min) : 0,173 / 0,119 / 0,145 / 0,125 s
- **Médiane 2 fenêtres : ~0,125 s** (B1 : 0,615 s fraîche, 0,177 s keep-alive)

**Froid isolate** : premier hit du soir (idle long) : **1,556 s** — cohérent
avec B1 (1,65 s). Après 10 min d'idle : aucune pénalité (0,173 s) — l'éviction
reste non déterministe à ces échelles ; la pénalité froide, quand elle
survient, reste ~1,4 s au-dessus du chaud. **L'axe 9 partie froide reste
entier ; la partie chaude est déjà sous la cible (≤ 0,2 s) dans ces conditions.**

**Débit — chunk inbox `page-Be-21blT.js` (132 624 o zstd, cf-cache HIT, PPT) :**
- Fenêtre 1 : totaux 0,169-0,188 s ; vitesses 704-791 kB/s
- Fenêtre 2 : totaux 0,152-0,192 s ; vitesses 690-874 kB/s
- **Médiane 2 fenêtres : ~745 kB/s ; le chunk inbox complet arrive en ~0,18 s**
  (B1 : 44-340 kB/s ; 383 kB en 3,5 s médian)

## 2. Implications pour le barème (`docs/spec/perf-9sur10.md`)

1. **Axe 1 (chemin critique)** : à ~745 kB/s, le shell 341 kB gz ≈ 0,5 s de
   transfert + RTTs. Le poids reste l'axe structurant (mobile/4G, autres FAI,
   WARP réactivé), mais le vécu fixe-PPT est déjà bien meilleur que B1.
2. **Axe 3/4 (N+1, ouverture de fil)** : chaque aller-retour coûte ~0,12 s au
   lieu de ~0,6 s ; le N+1 pèse moins en secondes mais reste le multiplicateur
   dominant du parcours authentifié (13-50 requêtes × RTT + payloads corps).
3. **Axe 9** : chaud = cible atteinte dans ces conditions ; le levier restant
   est le froid isolate (~1,5 s) → lazy-import du stack IA (w3f) reste justifié.
4. **M2 devra consigner warp on/off + colo et mesurer les deux états si
   possible** (sans modifier la config réseau de Thomas : état trouvé = état mesuré).

## 3. Parcours authentifié (axes 3 et 4) — MESURÉ

*Session : cookies staging de Thomas (Chrome Profile 1), déchiffrés via la
librairie du skill, chargés en session headless browse, fichier temp effacé.
Lecture seule. Inbox `/mail/inbox` chargée en conditions PPT/warp-off.*

### 3.1 — Premier rendu de l'inbox : le double N+1 MESURÉ (axe 3)

Capture réseau du premier rendu (194 requêtes, dont 55 tRPC = **2 259 kB**) :

| Appel tRPC | Occurrences | Signal |
|---|---|---|
| `mail.listThreads` | **1** | 6 732 ms, **947 octets** (renvoie des IDs seuls) |
| `mail.get` | **20** | total **1 802 kB**, moy 90 kB, **max 202 kB**, latences 4,0-5,9 s (médiane 4,9 s) |
| `mail.processEmailContent` | **16** | médiane 1 929 ms (max 3 363 ms) — sanitisation d'un HTML que la liste n'affiche pas |
| `bimi.getByEmail` | 12 | logos expéditeurs |
| divers (settings, labels, connections, outbox…) | 6 | — |

**Le N+1 de la revue est confirmé en production, chiffré :** une liste de
~13-20 fils visibles déclenche **20 `mail.get` de fils complets (1,8 MB) + 16
sanitisations serveur**, là où `listThreads` ne renvoie que 947 octets d'IDs.
C'est le coût dominant du parcours authentifié, exactement comme prédit. **Axe
3 = 2/10 confirmé mesuré** (avant w2a). Cible w2a : 1 requête `listThreads`
projetée, 0 `mail.get`, ~947 o → ~quelques kB de métadonnées.

### 3.2 — Ouverture de fil (axe 4)

Ouverture d'un fil (froid, jamais ouvert cette session) : la requête `mail.get`
du corps **n'apparaît pas** — le corps est déjà en cache, sur-préchargé par le
N+1 de la liste. Ne restent que `processEmailContent` (~1,7 s), `getMessageAttachments`,
`verifyEmail`, `brain.generateSummary` — 6 chacun (fils multi-messages). Perçu
~1,7-3 s dominé par la sanitisation serveur.

**Effet pervers à documenter pour w2a** : l'ouverture paraît « correcte »
(1,7 s) **uniquement parce que la liste a déjà tout téléchargé**. Une fois le
N+1 supprimé, l'ouverture devra charger son propre `mail.get` (4-5 s mesurés
solo) **sauf préchargement du fil au survol/sélection** (pattern Superhuman,
W2-A reco ou vague ultérieure). **Sans préchargement, w2a déplace le coût de la
liste vers l'ouverture — à cadrer explicitement.** Axe 4 : ~4-5/10, dépendant
de la stratégie de préchargement post-w2a.

### 3.3 — Signal cold-path (axe 9)

`listThreads` à **6,7 s pour 947 octets** = presque tout serveur (isolate
froid + Hyperdrive + requête DO du folder). Cohérent avec le froid isolate
mesuré au §1 (~1,5 s) amplifié par le chemin DO/Hyperdrive à froid. Renforce
le levier lazy-import stack IA (w3f).

### 3.4 — Sync initiale (axe 8) — toujours PENDING

Aucune re-sync forcée (écriture — hors périmètre lecture seule sans décision
explicite). `wrangler tail` non lancé cette session. **Axe 8 reste provisoire
(3/10)** ; à mesurer en M2 avec logs d'observabilité, ou lors d'un ajout de
compte contrôlé.
