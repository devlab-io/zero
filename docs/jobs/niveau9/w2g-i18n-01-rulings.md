# Rulings — w2g-i18n-01 (issue #38)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch — fences vague 5bis (2026-07-13)

1. #34 est MERGÉ : sa fence d'issue (« ne pas repasser derrière w2b ») s'applique aux
   fichiers qu'il a livrés — ses états sont DÉJÀ i18n (12 clés states._ en/fr), ne pas
   les retoucher : mail-list.tsx, thread-display.tsx, email-composer.tsx,
   reply-composer.tsx, use-optimistic-actions.ts, use-settings/use-drafts/use-threads,
   query-provider.tsx, app/page.tsx, app-sidebar.tsx, use-attachments.ts, lib/_ de #34.
2. #44 (a8-client) part EN PARALLÈLE : ses fichiers nommés sont MUST-NOT-TOUCH pour #38 —
   components/context/\*_ (palette), app/root.tsx, wrangler.jsonc, vite.config.ts,
   components/mail/thread-display_ (déjà couvert par 1).
3. Cible de #38 par soustraction : messages/\*\*, config locales paraglide/inlang,
   et les littéraux dans onboarding/settings/toasts HORS des fichiers ci-dessus.
   Collision détectée = BLOCKED partiel au rapport, jamais d'improvisation.
4. Procédure fin de job (leçon des 3 courses de la vague) : après le message STATUS
   final, STAND-DOWN ABSOLU — plus aucune écriture, même documentaire, sans ACK
   explicite de l'orchestrateur. Toute retouche post-rapport = incident.
