# WS3 — Bench performance (harnais R10) — analyse & mapping des budgets

commit gelé : `1c82b196` · harnais : `.architect/tmp/r10-harness.sh` (2 warmups + 10 itérations,
ordre ALTERNÉ A/B, médiane + p75) · brut : `shell-bench-raw.json` + `shell-bench-raw.csv`

## PÉRIMÈTRE HONNÊTE (point cardinal du run)
L'app est une **SPA `ssr:false`** : inbox/thread/composer sont rendus côté client APRÈS hydratation
et exigent le backend authentifié. La build locale contre staging échoue STRICTEMENT sur CORS
(fait #44) ; cookie/proxy/override INTERDITS. **Toutes les latences interactives de performance.md
(clavier, composer, thread caché, inbox chaude, INP/CLS du workflow) sont AUTHENTIFIÉES → BLOCKED.**
Aucune n'est estimée. Ce qui est mesurable localement sans auth : le service statique du shell.

## Mesuré (R10, wrangler dev local, loopback, sans throttle réseau)
| Scénario | médiane total | p75 total | médiane TTFB | p75 TTFB |
|---|---|---|---|---|
| A — landing `/` (101 KB, HomeContent réel prérendu) | 2,12 ms | 2,36 ms | 1,57 ms | 1,91 ms |
| B — coquille deep-link `/mail/inbox` (6 KB, `__spa-fallback.html`) | 2,07 ms | 2,48 ms | 2,02 ms | 2,43 ms |

Ce sont des **latences de service statique en loopback** (dominées par l'overhead wrangler),
PAS un proxy des budgets interactifs ni du profil réseau Tahiti. Elles prouvent seulement que le
shell prérendu et la coquille neutre sont servis instantanément en local (200, sans overflow).

## Plancher arithmétique profil Tahiti (calcul sur artefact mesuré — PAS une latence mesurée)
JS critique inbox = 435,9 KiB gz (446 350 o). @ 1,5 Mbps : transfert charge utile ≈ **2,38 s** ;
+ ≥1 RTT (175 ms) → **plancher ~2,55 s** pour la seule livraison du JS critique (hors HTML/CSS/
fonts/images). À traiter comme borne inférieure de livraison, jamais comme mesure d'un budget
interactif. Le budget « shell contraint ≤1500 ms » est donc structurellement menacé sur profil
Tahiti par le poids JS (435,9 > plancher implicite) — mesure runtime authentifiée requise pour statuer.

## Mapping budgets performance.md → état
| Budget (performance.md / issue #40) | État | Évidence |
|---|---|---|
| Clavier ≤100 ms | **BLOCKED** (authentifié) | demande superviseur |
| Composer ≤150 ms | **BLOCKED** (authentifié) | demande superviseur |
| Thread caché ≤200 ms | **BLOCKED** (authentifié) | demande superviseur |
| Inbox chaude ≤800 ms (p75, −10% vs Shortwave) | **BLOCKED** (authentifié) | demande superviseur |
| Shell contraint ≤1500 ms | **PARTIEL/BLOCKED** | shell local servi <3 ms ; boot authentifié + profil Tahiti BLOCKED |
| INP ≤200 ms / CLS ≤0,05 | **BLOCKED** (workflow authentifié) | Lighthouse sur landing possible (non-représentatif) ; workflow réel BLOCKED |
| JS critique inbox ≤420 KiB gz | **MESURÉ = 435,9 KiB gz → FAIL (−15,9)** | measure-critical.py (porteur nominal #44, plancher structurel) |
| Aucun chunk JS >900 KiB | **MESURÉ = PASS (NONE)** | measure-critical.py |
| 0 N+1 par ligne (50 lignes = 1 liste + ≤1 body) | **BLOCKED runtime** ; code = w2a/w2f (50 lignes = 1274 o gz) | trace réseau froide → demande superviseur |
| Comparatif Shortwave (−10% p75) | **BLOCKED** (session authentifiée absente) — ≠ échec (AS du run) | demande superviseur |
| GIF >1 MB dans public/ | **MESURÉ = 0 (PASS)** ; public/ 4,9 MB (−70 MB vs baseline) | A8-perf-structural.txt |

## Écart de commande gelée noté
La commande gelée `python3 scripts/checks/measure-critical.py .` depuis la RACINE renvoie
« NO RR7 manifest found » : la sortie RR7 est sous `apps/mail/build/client`, pas `./build/client`.
Chiffre réel obtenu avec `measure-critical.py apps/mail` (ou depuis `apps/mail` en base `.`) : 435,9 KiB gz.
