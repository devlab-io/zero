# a8-weight-hunt-01 — INVESTIGATION-FIRST (vague V7 « niveau réel »)

Deux cibles A8 du jugement final (`final-grading.md`) :
1. cold-start −1 s **NON prouvé** (−0,5) — VOLET 1 (exécutable directement).
2. JS critique **435,9 > 420** (−0,5) — VOLET 2 (investigation → ruling → exécution).

**Règle propriétaire absolue honorée** : la mesure gelée `measure-critical.py` NE CHANGE PAS ;
tentative de réduction RÉELLE d'abord ; toute idée d'évolution de métrique = remontée, jamais
exécutée ici. Aucun push (vague locale). Aucun commit.

## PHASE 0 — cadrage

- **Worktree** : `.../wt/niveau9/a8-weight-hunt-01`, branche `job/niveau9/a8-weight-hunt-01`,
  HEAD `375d1003…` = gel (rev-parse OK). Code `apps/` identique au merge #44 `f3e20e9d` (diff vide).
- **Rulings lus** : `v7-wave-rulings.md`, `a8-client-completion-01-rulings.md` (anti-gaming
  `f143abf9`, plancher structurel, KS7C4IRE = react-router core scellé, incident lockfile résolu).
- **Mesure gelée** : `python3 scripts/checks/measure-critical.py apps/mail` = **435,9 KiB gz**
  (446 350 o, 110 chunks). Fermeture = entry.client + root + (routes)/layout + mail/layout +
  [folder]/page + imports, somme gz unique.
- **Boundaries respectées** — écrit UNIQUEMENT : `docs/research/niveau9/perf/**`,
  `docs/jobs/niveau9/a8-weight-hunt-01.md`, `.architect/tmp/**` (jetables). **Non touché** :
  `scripts/checks/**`, `docs/checks/**`, lockfile, tout code produit. STAND-DOWN post-STATUS.

## VOLET 1 — preuve cold-start AVANT/APRÈS (COMPLÈTE)

Détail + brut : `docs/research/niveau9/perf/coldstart-before-after.md` +
`coldboot-{after-head,before-0e55cc09}.json`.

- **AVANT** = `0e55cc09` (= `d5de5c3a^`) : dernier état avant le retrait du wrapper 60 s et la
  chute du JS — porte les deux propriétés du transfert (629,5 KiB + wrapper présent). Choix justifié.
- **APRÈS** = HEAD. **6 boots frais** de `wrangler dev` / variante (invocation identique), TTFB
  première requête, médiane + variance. Worktree jetable créé PUIS SUPPRIMÉ (preuve : `git worktree
  remove` OK, 0 entrée résiduelle, pruned).
- **Empirique** : cold-boot médian APRÈS **780,8 ms** vs AVANT **807,3 ms** → **Δ +26,5 ms, DANS le
  bruit** (σ 46–187 ms). **PAS −1 s.**
- **Proxy déterministe (#6a)** : bundle serveur `wrangler --dry-run` **2756,17 → 2743,25 KiB gz =
  −12,92 KiB (−0,47 %)** — trop petit pour −1 s (mécanisme confirmé, chiffres = rapport #44).
- **Où le −1 s vit honnêtement** : transfert client, borne **−1,06 s** à 1,5 Mbps sur le delta
  MESURÉ −193,6 KiB gz. Borne arithmétique, PAS mesure runtime (FCP/LCP authentifié Tahiti = BLOCKED).
- **VERDICT** : critère « −1 s » **NON acquis** au cold-start serveur mesurable ; défendable
  seulement comme borne de transfert client. Écrit tel quel (honnêteté exigée).

## VOLET 2 — chasse au poids RÉEL (investigation → STOP → ruling)

Détail : `docs/research/niveau9/perf/critical-closure-decomposition.md`.

Immobile par ruling : react (84,0k) + KS7C4IRE (40,9k) + rows page (40,0k) = 164 k (36,7 %).

**Pistes chiffrées** (chunk/fichier · octets · risque · preuve) :
- **LEAD A — split god-module `email-utils`** (PRIMAIRE, HIGH, LOW risk). `mail-list-thread.tsx`
  (froid) importe le seul `highlightText` (JSX pur) → traîne zod (12,2k) + Color (9,4k) +
  email-addresses. thread-display lecteur = LAZY (non froid). Correctif = déplacer `highlightText`
  dans un module léger. **HIGH-confidence évincible ~21,6 k → 435,9 → ~414,8 KiB, SOUS 420.**
  DOMPurify reste (bimi-avatar froid, sécurité SVG). Pur code-motion, pas de lazy-at-mount.
- **LEAD B — react-hook-form** (index.esm 9,3k) cold via nav-main→label-dialog. MEDIUM/risqué :
  vérifier patron de rendu (intent-based OK / mount caché = gaming) AVANT ruling.
- **LEAD C — `build.target: es2022`** (vite.config.ts) : ~2–5 k, global, LOW risk.
- **LEAD D — icônes** (~29 k) : tree-shaking partiel, majoritairement rendues cold → NON recommandé.
- **LEAD E — onboarding** (7 k) : hors-fence #44, rappelé.

**STOP investigation** : j'attends un ruling nommant les coupes autorisées avant toute exécution.

## EXÉCUTION (rulings df491a4d + af1c5a48 + b2e7fe72)
Détail + trace : `docs/research/niveau9/perf/lead-ac-execution-results.md`, `cold-network-trace-final.md`.

Périmètre écrit : nouveau `apps/mail/lib/email-utils-highlight.client.tsx` ; `email-utils.client.tsx`
(retrait du seul export highlightText) ; `mail-list-thread.tsx` (1 import) ; `vite.config.ts`
(build.target) ; `config/shortcuts.ts` (zod→interface, LEAD F). `email-utils.ts`, thread-display.tsx,
lockfile, measure-critical.py — INTOUCHÉS (vérifié).

| État | JS critique | Gate ≤420 | Delta |
|---|---|---|---|
| Baseline | 435,9 KiB gz (446 350 o) | FAIL −15,9 | — |
| + LEAD A (split highlightText, pur code-motion) | 432,3 | FAIL | −3,6 |
| + LEAD A + LEAD C (es2022) | 426,6 | FAIL | −5,7 |
| + LEAD A + C + F (shortcuts zod→interface) | **414,6 KiB gz** (424 593 o) | **PASS +5,4** | −12,0 ; **−21,3 total** |

- LEAD A : évince color + email-addresses + @react-email du cold (trace binaire) ; DOMPurify reste
  (bimi-avatar, sécurité). LEAD C : es2022 global. LEAD F : zod ÉVINCÉ du cold (schéma mort→interface).
- Aucun lazy-au-mount (f143abf9 intégral) ; measure-critical.py INTOUCHÉ ; DOMPurify conservé.
- **Gate ≤420 ATTEINT : 414,6 KiB gz, PASS marge +5,4 KiB — légitimement.**
- Follow-up LEAD B (react-hook-form) : NON exécuté, conditionné à preuve montage-sur-intention.
- **Gates RC natifs** : tsc mail 0 ; vitest mail 139/139 ; build mail exit 0 ; measure reproductible.

## MIRROR: ORCHESTRATOR
- Mesure gelée intacte, barème/`measure-critical.py` non touchés. Aucun amendement de métrique
  proposé en exécution — remontée uniquement (le −1 s « borne de transfert » n'est PAS présenté
  comme cold-start prouvé ; toute décision de re-définition = niveau critique droite / propriétaire).
- Anti-gaming `f143abf9` respecté : LEAD A évince des octets réseau RÉELS (pas de lazy-au-mount) ;
  LEAD B explicitement conditionné à une preuve intent-based avant exécution.
- Scellés honorés : react core + KS7C4IRE non touchés. Lockfile non touché.
- Reste à l'orchestrateur : émettre le ruling des coupes (LEAD A recommandé en premier ;
  C sûr en complément ; B après vérif ; D/E arbitrage). Puis exécution bornée + re-gates.

## STATUS
- VOLET 1 : **COMPLET** — preuve avant/après livrée, verdict honnête (−1 s non acquis au serveur ;
  borne transfert client −1,06 s). Worktrees jetables nettoyés (preuve).
- VOLET 2 : **EXÉCUTÉ (LEAD A + C + F sur rulings)** — JS critique 435,9 → **414,6 KiB gz** (−21,3 :
  A pur code-motion −3,6, C es2022 −5,7, F zod-mort→interface −12,0). **Gate ≤420 ATTEINT, PASS
  marge +5,4 KiB, légitimement** (zéro gaming, measure-critical intouché, DOMPurify conservé).
- Gates natifs : tsc mail 0, vitest mail 139/139, build mail exit 0, measure-critical reproductible.
- Périmètre respecté (4 fichiers code + 1 nouveau + docs) ; interdits intouchés. Aucun commit.
- **STAND-DOWN** après ce STATUS jusqu'à ACK/ruling orchestrateur.
