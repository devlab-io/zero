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

## Ruling coordination root.tsx (orchestrateur, 2026-07-13)

#38 a identifié 5 littéraux ErrorBoundary dans app/root.tsx (ton fichier). Il livre
les clés en/fr SEULEMENT (mapping littéral→clé à son rapport) ; TOI SEUL touches
root.tsx. Après le merge de #38 et ton rebase dessus, tu consommes ces clés dans
root.tsx en delta borné re-gaté (annonce-le en PHASE mise à jour de ton rapport).
Si tu n'as finalement pas besoin d'éditer root.tsx, signale-le : le delta de
consommation revient à l'orchestrateur. Aucun partage de fichier en parallèle.

## Ruling extension d'ancrage (orchestrateur, 2026-07-13, sur preuve mesurée)

Preuve du builder (graphe d'ancrage + arithmétique) : gate 420 infermable sous la fence
littérale — plancher within-boundary ~604 KiB. Ancres dominantes : app-sidebar.tsx
(motion via nav-user/theme-toggle + posthog via create-email), entry.client.tsx (motion),
mail.tsx (~105 KB rows), chunk-KS7C4IRE (40,9 KB, source à identifier). Le gate étant le
LIVRABLE NOMINAL de #44 (condition critique droite #33), option (A) retenue, BORNÉE :

- MAY-TOUCH ÉTENDU (imports lazy / éviction motion UNIQUEMENT, comportement inchangé,
  mesure avant/après PAR CIBLE, re-gates complets) : components/ui/app-sidebar.tsx,
  components/mail/mail.tsx, app/(routes)/mail/[folder]/page.tsx, app/entry.client.tsx,
  components/icons/animated/_, components/theme/_, components/ui/nav-user.tsx.
- EXCEPTION COLLISION : components/create/create-email.tsx est DANS LE BATCH EN VOL de
  #38 (littéraux i18n) — même patron que root.tsx : #44 le traitera en DELTA BORNÉ
  APRÈS merge #38 + rebase. Interdit d'ici là.
- chunk-KS7C4IRE : identification de la source d'abord (rapport), ruling additionnel si
  l'ancre est encore ailleurs.
- Libellé honnête inchangé : le chiffre mesuré est le chiffre annoncé ; « gate atteint »
  seulement si ≤ 430 080 octets à la mesure gelée.
- Les édits #1/#2 (thread-display, use-optimistic-actions, reply-composer) sont GARDÉS
  comme fondations (3 ancres réellement retirées, efficaces dès app-sidebar lazifié).
