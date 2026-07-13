# Plan UX 9/10 — matière de décomposition pour niveau9 (w2e / w2g / w2b)

*Source : plan approuvé en session par Thomas le 2026-07-12 (« Mega plan UX — atteindre 9/10 », plan-mode, `~/.claude/plans/fais-le-mega-plan-deep-flask.md`). Périmètre acté à l'intake : UX + vitesse ressentie · desktop-first (tactile hors scope) · débranding léger (onboarding Devlab FR, landing hors scope). Fondation : `docs/research/revue-perf-ux.md` + annexes (`revue-ux-states.md` 20 constats, `revue-ux-flows.md` 15 constats).*

**Statut** : la vague 0 (quick wins) est livrée — commit `5cb35016` sur `factory/perf` (icônes PJ vectorielles 4,6 MB→9 kB, locales 19→2, `sanitizeOutput` conditionné, 25 `console.log` retirés des chemins chauds) + orphelins/JSON locales dans `0e83bfbb`. Le reste du plan recoupe le périmètre revendiqué par le run niveau9 (#13) : ce document en fait la matière première de décomposition plutôt qu'un run concurrent.

---

## Mapping vers les issues niveau9

| Tranche du plan UX | Issue niveau9 | Contenu à absorber |
|---|---|---|
| G0 gel des clés i18n | `w2g-i18n` (V5) | Mécanique du gel : § G0 ci-dessous |
| S6 clavier câblage/découvrabilité | `w2e-keyboard-parity` (V4) | § S6 |
| S7 composer confiance | `w2e-keyboard-parity` (V4) | § S7 + gate live |
| B1/B2/S9 fiabilité réseau + états | `w2b-robustness` (V5) | AC détaillés dans le plan source + `revue-ux-states.md` §2-3 |
| P1 recherche 100 ms, P2/P3 a11y + polish | V5/V6 (à ventiler) | `revue-ux-flows.md` §5, `revue-ux-states.md` §7 |

**Note sur `w2g-i18n` « sacrifiable »** : le coût réel chute avec la mécanique G0 — une issue purement mécanique (2 fichiers JSON, zéro code) qui pré-gèle toutes les clés ; l'i18n de chaque surface devient ensuite ~1 ligne par chaîne dans l'issue qui possède déjà la surface. L'axe 7 du barème UX (feedback & i18n, actuel 3/10) est inatteignable à 9 sans elle.

---

## G0 « gel des clés i18n » — mécanique, effort M

**Goal** : `messages/en.json` + `fr.json` contiennent toutes les clés des vagues aval ; aucun consommateur touché (paraglide génère des fonctions typées → G0 ne peut PAS partager une vague avec ses consommateurs).

**Prérequis livré** : locales 19→2 (`5cb35016`).

**AC** :
1. Chaque chaîne en dur inventoriée a sa clé en+fr : 62 toasts (`grep "toast\.(error|success|info)\('"` hors `m[...]`), états vides (mail-list.tsx:970, thread-display.tsx:737, palette :848/:958/:1140), erreurs + bannière réseau (nouvelles), onboarding complet (onboarding.tsx:8-42,121-124), upsell connexion (add.tsx:77-84), ErrorBoundary (root.tsx:151-152), libellé « Undo » (use-optimistic-actions.ts:170, use-undo-send.ts:77), aria-labels à venir.
2. Namespaces figés dans l'issue : `common.errors.*`, `common.network.*`, `common.actions.*`, `onboarding.*`, `a11y.*`.
3. `fr` = vraies traductions ; le copywriting onboarding Devlab (français, ton local) se fait ICI.
4. Build paraglide OK ; **aucun fichier hors `messages/en.json`+`fr.json` modifié**.

**Contrat** : la liste des clés = interface pour toutes les issues de surface aval.

---

## S6 « clavier : câblage & découvrabilité » — effort M

**AC** :
1. `HotkeyProviderWrapper` monté une seule fois — retirer de `app/(routes)/mail/layout.tsx:8` (double montage vérifié : aussi dans `app/(routes)/layout.tsx:10` ; scopes global+navigation double-enregistrés → risque double-undo `mod+z`).
2. Raccourcis morts : `1-6` (handlers commentés `mail-list-hotkeys.tsx:276-281`) rebranchés sur le switch de catégorie ; `v`/openVoice (aucun handler, `global-hotkeys.tsx:14-21`) retiré du catalogue `config/shortcuts.ts`.
3. `/` ouvre la palette en vue recherche (muscle-memory Gmail/Superhuman ; aujourd'hui aucun binding — mail.tsx:450-493 n'est qu'un bouton).
4. `?` → overlay de raccourcis en contexte (nouveau `components/shortcuts-overlay.tsx`, réutilise les clés i18n de /settings/shortcuts — zéro nouvelle clé) au lieu de la navigation vers la page réglages.
5. `⌘0` (AI sidebar, hardcodé `ai-sidebar.tsx:313`) déclaré au catalogue.
6. Palette : saved searches / filter builder (~250 lignes atteignables commentées `command-palette-context.tsx:684-700`) réexposés OU supprimés — décision documentée dans le rapport.

**MAY TOUCH** : `config/shortcuts.ts`, `lib/hotkeys/**`, `app/(routes)/layout.tsx`, `app/(routes)/mail/layout.tsx`, `components/providers/hotkey-provider-wrapper.tsx`, `components/context/command-palette-context.tsx`, nouveau `components/shortcuts-overlay.tsx`, `ai-sidebar.tsx` (ligne binding seule).
**MUST NOT** : `mail-list.tsx`, `thread-display.tsx`, `email-composer.tsx`, `messages/**`, `docs/checks/**`.

---

## S7 « composer : confiance » — effort M/L · GATE live avant gel

**Le défaut le plus coûteux du produit** (revue flows #1) : `r`/`a`/`f` ouvre le composer avec « À » vide. `EmailComposer` déclare `replyingTo` (`email-composer.tsx:70`) mais ne le consomme jamais ; le `useEffect` de `reply-composer.tsx:57-109` calcule les bons `to`/`cc` selon le mode **et jette le résultat** (commentaire « happens in EmailComposer », qui ne le fait pas) ; `initialTo` ne vient que du draft (`:286`), vide pour une réponse fraîche.

**GATE** : vérifié code, jamais runtime — à confirmer en session live authentifiée avec Thomas avant gel du check. Le check retenu doit être comportemental (test composant : reply → `to` pré-rempli), valable quel que soit le constat live.

**AC** :
1. `r`/`a`/`f` → composer avec À (et Cc en reply-all) pré-remplis + objet Re:/Fwd: — consommer le calcul existant de `reply-composer.tsx:57-109` ou le passer en `initialTo`/`initialCc`.
2. Démontage avec contenu non sauvé → sauvegarde brouillon réelle (aujourd'hui : `console.warn` seul, `email-composer.tsx:524-534`), y compris changement de thread/route.
3. Autosave persiste un brouillon sans sujet/destinataire si corps non vide (bloqué aujourd'hui par `email-composer.tsx:451`).
4. `Esc` avec draft existant modifié → même garde-fou que sans draft (incohérence `email-composer.tsx:321-328`).
5. `⌘Enter` envoie depuis À/Objet (binding form-level ; aujourd'hui keymap TipTap seul, `email-composer.tsx:272`).
6. Toasts composer via clés G0 (dépendance : G0 mergée).

**MAY TOUCH** : `components/create/email-composer.tsx`, `components/mail/reply-composer.tsx`, `lib/hotkeys/compose-hotkeys.tsx`.
**MUST NOT** : `hooks/use-undo-send.ts`, `components/create/create-email.tsx`, `use-optimistic-actions.ts`, `messages/**`, `docs/checks/**`.

---

## Gates de session live (M1 UX — cumulable avec le M1 perf)

- **Bloquant S7** : reply-À-vide en runtime.
- Recommandé : effet double-undo du double montage (S6) ; `handleNext` saute-t-il un fil après archive (PROBABLE, `thread-display.tsx:202-219` — index pré-compaction) ; action optimiste perdue si fermeture onglet < 5 s (PROBABLE, `use-optimistic-actions.ts` — mutation déclenchée par onAutoClose/onDismiss du toast seulement).

## Checks gelables suggérés

- S6 : test « chaque entrée du catalogue `keyboardShortcuts` a un handler enregistré » (fin structurelle des touches mortes) ; grep 1 seul montage `HotkeyProviderWrapper`.
- S7 : test composant reply→to pré-rempli ; test unmount→saveDraft appelé.
- G0 : build paraglide 2 locales ; diff limité à `messages/{en,fr}.json` ; script d'inventaire `grep -c "toast\.(error|success)\('"` fourni pour les issues aval (cible finale 0 hors `m[...]`).
