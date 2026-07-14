# Cold-start AVANT/APRÈS — preuve mesurée (job a8-weight-hunt-01, volet 1)

Cible du barème A8 (palier 9) : **« cold start −1 s mesuré avant/après »** — noté NON prouvé
au jugement final (`final-grading.md` L136 : *aucune évidence, grep cold-start = 0*). Ce
fichier fournit la mesure manquante, honnêtement.

> **Règle propriétaire respectée** : la mesure gelée `measure-critical.py` n'est PAS touchée ;
> aucun amendement de barème. Ce volet ne fait que MESURER un avant/après réel.

## Protocole (ruling #6b, littéral)

- **AVANT** = SHA `0e55cc09` (= `d5de5c3a^`, parent du commit perf #44). Justification du choix :
  c'est le dernier état AVANT le commit `d5de5c3a` qui (a) supprime le wrapper 60 s
  (`lib/gmail-rate-limit.ts`) et (b) fait chuter le JS critique. Il porte donc SIMULTANÉMENT
  les deux propriétés du « transfert » (JS critique ~629 KiB **et** wrapper 60 s présent),
  ce qui en fait le point de comparaison représentatif demandé.
- **APRÈS** = HEAD `375d1003` (code `apps/` identique au merge #44 `f3e20e9d` — diff `apps/` vide).
- **Harnais** : `.architect/tmp/coldboot-harness.py` — **6 démarrages FRAIS** de `wrangler dev`
  par variante (≥5 exigé), process en session isolée, `.wrangler/tmp` purgé, **port distinct
  par boot** (anti-TIME_WAIT), kill du **groupe de processus** entre boots. Mesure sur la
  **PREMIÈRE requête** après lancement : `cold_boot_wall_ms` (lancement → premier octet) et
  `req_ttfb_ms` (TTFB de cette requête seule). wrangler 4.32.0.
- **Invocation IDENTIQUE** sur les deux variantes (`wrangler dev --port P --ip 127.0.0.1`,
  **sans `--env`** : le build Vite émet une config redirigée qui rejette `--env` — cf. note
  reproductibilité en bas). Worktrees jetables créés PUIS SUPPRIMÉS (preuve de nettoyage au rapport).
- Reproduction des baselines JS critiques par build local : AVANT = **629,5 KiB gz**,
  APRÈS = **435,9 KiB gz** (Δ mesuré = **−193,6 KiB gz**).

## Résultat 1 — cold-boot empirique (wrangler dev, serveur/edge)

| Variante | cold_boot_wall médian | min / max | σ | req_ttfb médian |
|---|---|---|---|---|
| APRÈS (HEAD, 435,9 KiB) | **780,8 ms** | 730 / 849 | 46,4 ms | 131,5 ms |
| AVANT (0e55cc09, 629,5 KiB, wrapper 60 s) | **807,3 ms** | 724 / 1203 | 187,0 ms | 136,1 ms |
| **Δ (avant − après)** | **+26,5 ms** | — | — | +4,6 ms |

Brut : `coldboot-after-head.json`, `coldboot-before-0e55cc09.json` (6 boots chacun, tous http=200).

**Le delta médian est ~26 ms, entièrement DANS le bruit** (σ 46–187 ms ; l'AVANT a 2 outliers
à 1114/1203 ms). **Ce n'est PAS −1 s.**

## Résultat 2 — proxy déterministe du mécanisme #6a (bundle serveur)

Le seul changement cold-start côté serveur est le retrait du wrapper 60 s (`apps/server`).
`wrangler deploy --dry-run --env local` :

| Variante | bundle serveur gz | raw |
|---|---|---|
| AVANT (0e55cc09, wrapper présent) | **2756,17 KiB** | 21940,54 KiB |
| APRÈS (HEAD, wrapper retiré) | **2743,25 KiB** | 21869,50 KiB |
| **Δ** | **−12,92 KiB (−0,47 %)** | −71 KiB |

(Chiffres identiques au rapport #44 — confirmés indépendamment.) Une réduction de bundle de
**0,47 %** est déterministiquement incapable de déplacer le cold-start de 1 s.

## Pourquoi il n'y a PAS de −1 s côté serveur (mécanisme)

1. Le worker mail est un **fronton d'assets trivial** (`workers/spa-fallback.ts`, ~40 lignes) ;
   son cold-boot est dominé par le démarrage FIXE de wrangler (~750–800 ms), invariant à la
   taille du JS client.
2. La réduction du JS critique (629,5 → 435,9) est un bénéfice **navigateur** (download + parse) ;
   le shell HTML servi est identique, le JS est téléchargé SÉPARÉMENT par le navigateur → **non
   capturé par le TTFB serveur**.
3. Le seul mécanisme serveur (#6a) pèse 0,47 % du bundle → négligeable.

## Où un « −1 s » existe honnêtement (borne, pas mesure runtime)

Le gain réel vit côté **transfert client** sur profil Tahiti. Δ mesuré = **−193,6 KiB gz** ;
à 1,5 Mbps (profil README-shell-bench) : 193,6 KiB × 1024 × 8 / 1,5e6 ≈ **−1,06 s de transfert
JS** sur cache navigateur froid. C'est une **borne arithmétique sur un delta MESURÉ**, pas une
mesure runtime de FCP/LCP. La mesure runtime authentifiée sur profil Tahiti reste **BLOCKED**
(SPA `ssr:false` + CORS strict staging — liste BLOCKED du run).

## VERDICT (honnête, tel qu'exigé)

- Au niveau **cold-start serveur/edge MESURABLE** : Δ ≈ **+26 ms** (dans le bruit) → le critère
  **« −1 s » n'est PAS acquis**. Écrit tel quel.
- Le −1 s n'est **défendable que comme borne de transfert client** (−1,06 s à 1,5 Mbps, dérivée
  du delta de bundle MESURÉ) — jamais comme cold-start runtime prouvé (BLOCKED).

## Note reproductibilité

`wrangler dev --env local` échoue sur le build mail (config redirigée du plugin Vite
Cloudflare : *« set the environment in your build tool »*). L'invocation sans `--env` boote les
deux variantes identiquement (assets-only AVANT / spa-fallback APRÈS) → comparaison équitable.
Écart avec la commande du rapport #44 noté, sans incidence sur le delta (invariant d'invocation).
