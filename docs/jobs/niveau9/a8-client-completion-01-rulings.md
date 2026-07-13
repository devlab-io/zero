# Rulings — a8-client-completion-01 (issue #44)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch (2026-07-13)

1. Coordination posthog RÉSOLUE : #34 est mergé — use-optimistic-actions.ts est à toi
   pour l'import posthog UNIQUEMENT (le hook vient d'être refondu par #34 et testé par
   #35 : 301 tests verts au gel — ne casse RIEN d'autre dans ce fichier).
2. #38 (i18n) part EN PARALLÈLE : messages/\*\*, config locales, et littéraux
   onboarding/settings lui appartiennent — tu n'y touches pas. Tes fichiers nommés lui
   sont interdits en retour.
3. Gate NOMINAL : JS critique ≤420 KiB gz à la mesure gelée measure-critical.py.
   Libellé honnête obligatoire : le chiffre mesuré est le chiffre annoncé, jamais
   « poids OK » tant que >420 (jurisprudence #33/#20).
4. Landing : la cause (auth-redirect dans clientLoader de app/page.tsx) est PROUVÉE par
   l'expérience réversible de #33 — relis son rapport avant d'implémenter. Le finding
   gelé wrangler↔artefact doit être RE-PROUVÉ après changement (curl / et /mail/inbox).
5. Cold-start : chaînes dominantes prouvées par #31 (rapport w2f) ; harnais R10 =
   wrangler dev local, 2 warmups + 10 itérations, médiane/variance avant-après.
   AUCUN deploy.
6. Procédure fin de job : après le message STATUS final, STAND-DOWN ABSOLU — plus
   aucune écriture sans ACK orchestrateur. Toute retouche post-rapport = incident.
