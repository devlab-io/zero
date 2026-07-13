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

## Ruling coordination root.tsx (orchestrateur, 2026-07-13)

Constat #38 (PHASE 0) : l'unique ErrorBoundary user-facing restant vit dans
app/root.tsx — fichier fenced à #44 — avec 5 littéraux. DÉCISION : la disjonction ne
se casse PAS. #38 possède UNIQUEMENT les nouvelles clés en/fr correspondantes
(messages/\*\*, nommage cohérent, documentées au rapport avec le mapping littéral→clé
pour consommation aval) et NE TOUCHE PAS root.tsx. #44 consommera ces clés dans
root.tsx APRÈS merge de #38 + rebase, via un delta borné re-gaté. Si #44 n'a
finalement pas à éditer root.tsx pour ses propres besoins, le delta de consommation
est routé EXPLICITEMENT à l'orchestrateur — aucun job ne contourne la localisation ni
ne partage le même fichier en parallèle. Le reste de #38 continue (onboarding +
~58 toasts hors fence).
