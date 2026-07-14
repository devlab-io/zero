# LEAD A + LEAD C + LEAD F — résultats d'exécution MESURÉS (rulings df491a4d, af1c5a48, b2e7fe72)

Mesure gelée `measure-critical.py apps/mail` INTOUCHÉE. Quatre builds, même commande de mesure :

| État | JS critique (gz) | Gate ≤420 | Delta |
|---|---|---|---|
| Baseline (HEAD, avant coupe) | **435,9 KiB** (446 350 o) | FAIL −15,9 | — |
| + LEAD A seul (split highlightText) | **432,3 KiB** | FAIL −12,3 | **−3,6 KiB** |
| + LEAD A + LEAD C (es2022) | **426,6 KiB** (436 788 o) | FAIL −6,6 | **−5,7 KiB (C)** |
| + LEAD A + C + F (shortcuts zod→interface) | **414,6 KiB** (424 593 o) | **PASS +5,4** | **−12,0 KiB (F)** ; **−21,3 total** |

`CHUNKS >900 KiB : NONE (PASS)`. Gates : **tsc mail = 0**, vitest mail **139/139**, build mail exit 0.

**GATE ≤420 ATTEINT : 414,6 KiB gz (marge +5,4 KiB), légitimement** (pur code-motion + type-only
+ cible moderne ; zéro metric-gaming ; DOMPurify honnêtement conservé pour la sécurité BIMI).

> **POST-REBASE (sur factory b2e7fe72 : gitleaks + a1 + a6 + a5-console)** : conflit unique
> `email-utils.client.tsx` résolu (conversions console→log d'a5 conservées, bloc highlightText
> retiré ; `highlightText` déplacé porte désormais `log.warn` d'a5, pas `console.warn`). Re-mesure
> = **415,0 KiB gz (424 910 o), GATE PASS marge +5,0 KiB** (+0,4 vs 414,6 : `lib/log.ts` dans
> l'arbre). Gates : tsc mail 0, vitest mail 144/144, console-ratchet 8/8 & 6/6, build exit 0.

## LEAD A — split `highlightText` (pur code-motion, EXÉCUTÉ)
- Nouveau `apps/mail/lib/email-utils-highlight.client.tsx` (highlightText, JSX pur, zéro dep) ;
  `mail-list-thread.tsx` change 1 import ; `email-utils.client.tsx` perd son seul export
  `highlightText` ; `email-utils.ts` INTOUCHÉ.
- **Aucun lazy-au-mount / preload / changement de condition de chargement** (f143abf9 intégral) :
  déplacement statique de code, imports statiques des deux côtés → la fermeture manifest ÉGALE
  la charge réseau (pas de gaming possible par construction).
- **Éviction MESURÉE du cold closure** (trace binaire sur manifest final) : `color` **ÉVINCÉ**,
  `email-addresses` **ÉVINCÉ**, `@react-email/components` **ÉVINCÉ** (plus tiré par
  mail-list-thread ; ne reste qu'au lecteur thread-display LAZY + compose).
- **DOMPurify RESTE** (attendu, statique) : ancré FROID indépendamment par
  `components/ui/bimi-avatar.tsx` (rendu par ligne, `mail-list-thread.tsx:283`, sanitisation SVG
  BIMI non-fiable — sécurité XSS). Chunk `purify.es` (8,5k) + inline page/app-sidebar.
- **Gain net +3,6 KiB seulement** : l'éviction color/email-addresses/react-email est en partie
  compensée par le re-chunking rollup (DOMPurify isolé dans son propre chunk avec surcoût gz).

## LEAD C — `build.target: 'es2022'` (EXÉCUTÉ)
- `apps/mail/vite.config.ts`, un champ. Down-leveling supprimé sur code app + deps non-prebundlées.
  Comportement identique sur navigateurs cibles (SPA evergreen). **−5,7 KiB** global mesuré.

## POURQUOI le gate n'est PAS atteint — correction honnête de l'estimation d'investigation
L'estimation initiale (LEAD A ~21,6 k) surattribuait à email-utils.client. Le MESURÉ corrige :
les deps lourdes ont des ancres froides SUPPLÉMENTAIRES hors du chemin email-utils.client :
- **zod (12 083 gz, chunk `types`) RESTE** — ancré par `config/shortcuts.ts` ← `lib/hotkeys/*`
  (global/mail-list/navigation-hotkeys, FROIDS). LEAD A ne touchait pas ce chemin.
- **DOMPurify (~8,5 k) RESTE** — bimi-avatar (sécurité, non évinçable).

## LEAD F — zod mort de `config/shortcuts.ts` (EXÉCUTÉ, ruling b2e7fe72)
**`shortcutSchema = z.object({...})` n'était JAMAIS `.parse()`/`.safeParse()` — usage UNIQUEMENT
`z.infer` (type).** La validation zod était du **poids runtime MORT** : zod (~12 k gz) dans le cold
closure uniquement pour dériver un TYPE. Ancré froid par `config/shortcuts.ts ← lib/hotkeys/*`.
- **Correctif exécuté** : `shortcutSchema` + `z.infer` remplacés par une `interface Shortcut`
  explicite (champs identiques : `type: 'single'|'combination'|'sequence'`, `preventDefault?`,
  `ignore?` avec sa doc conservée) ; `ShortcutType`/`EnhancedShortcut`/registres inchangés ;
  `import { z }` retiré. `config/shortcuts.ts` SEUL fichier touché.
- **Vérif consommateurs (read-only)** : `shortcutSchema` (valeur) consommé NULLE PART ailleurs ;
  `lib/hotkeys/*` + settings page importent uniquement le type `Shortcut` + les registres
  (`keyboardShortcuts`/`enhancedKeyboardShortcuts`). Comportement runtime IDENTIQUE.
- **Éviction MESURÉE** : zod **ÉVINCÉ du cold closure** (chunk `types-*` absent de la fermeture ;
  encore émis pour compose/settings lazy, plus dans le chemin froid). **−12,0 KiB → 414,6 : PASS.**

## Verdict final
JS critique = **414,6 KiB gz, GATE ≤420 → PASS (marge +5,4 KiB)**. Réductions légitimes cumulées
−21,3 KiB (A pur code-motion −3,6 ; C es2022 −5,7 ; F type-only −12,0). Aucun lazy-au-mount, aucun
metric-gaming, DOMPurify conservé (sécurité). Le gate #44 déclaré « structurellement hors d'atteinte »
était en réalité pollué par du zod runtime mort + un helper de surlignage sur-couplé — les deux retirés.
