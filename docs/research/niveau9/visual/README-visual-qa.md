# WS4 — QA visuelle desktop/mobile — surface atteignable SANS auth

commit gelé : `1c82b196` · wrangler dev local :3000 · Chromium (Playwright 1.54.2) ·
brut : `visual-qa-results.json` · captures : `*.png`

## Périmètre honnête
visual-qa.md exige « les routes exactes changées ouvertes dans un navigateur local » — inbox/list/
thread/composer RÉELS sont AUTHENTIFIÉS (CORS staging #44) → BLOCKED. Couvert ici : landing réelle,
coquille deep-link, page login (états 404 + erreur), en desktop 1440×900 et mobile 390×844,
+ reduced-motion. Aucune capture ne présente d'overflow horizontal (scrollW == clientW partout).

## Captures & constats
| Fichier | Viewport | HTTP | Overflow H | Constat |
|---|---|---|---|---|
| landing-desktop-1440x900.png | 1440×900 | 200 | non | Landing prérendue **réelle** (hero « AI Powered Email », nav, mockup produit inbox, Y Combinator). Lisible, contraste sombre net. |
| landing-mobile-390x844.png | 390×844 | 200 | non | Landing responsive, pas d'overflow. |
| landing-desktop-reduced-motion.png | 1440×900 | 200 | non | prefers-reduced-motion:reduce émulé — rendu stable (comparer aux animations : mouvement non essentiel à retirer, cf. w2cd/motion). |
| deeplink-shell-inbox-desktop.png | 1440×900 | 200 | non | Deep-link `/mail/inbox` sans session → **404 propre** (« Page Not Found » + Go Back). Ni page blanche ni skeleton infini. |
| deeplink-shell-inbox-mobile.png | 390×844 | 200 | non | idem mobile. |
| login-desktop.png | 1440×900 | 200 | non | `/login` sans backend → **ErrorBoundary lisible** (« Something went wrong » + diagnostic JSON + Refresh / Log Out and Refresh). État d'erreur distinct, avec récupération. |

## Console (attendu, hors périmètre)
Erreurs console = 404 d'assets backend-dépendants + « Failed to get session » (backend local absent
volontairement) : cohérent avec l'environnement non authentifié, non imputable au code produit.
L'ErrorBoundary du login capture proprement l'échec JSON (réponse vide du backend) → preuve d'un
état d'erreur honnête plutôt qu'un crash.

## BLOCKED (authentifié) → demandes superviseur
- Inbox/list/thread/composer réels : états loading / empty / stale-offline / error DISTINCTS.
- Focus clavier visible suivant la navigation de liste sans saut de scroll inattendu.
- Shortcut help contextuel et cohérent avec les handlers réels (cf. résiduel R2 closeView no-op).
Voir les demandes superviseur du rapport de job.
