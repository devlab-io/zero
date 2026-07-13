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

## Amendement immédiat (coordination superviseur, même date)

Le couple app-sidebar.tsx + create-email.tsx (chemin posthog prouvé) passe INTÉGRALEMENT
en séquence post-#38 : attendre merge #38 → rebase #44 → delta borné sur ces DEUX
fichiers avec re-gates. Aucune écriture dessus d'ici là (même principe que root.tsx).
L'extension immédiate se limite donc à : mail.tsx, app/(routes)/mail/[folder]/page.tsx,
entry.client.tsx, components/icons/animated/_, components/theme/_, nav-user.tsx —
imports lazy / éviction motion uniquement. La dé-ancre motion peut passer par
icons/theme/nav-user sans toucher app-sidebar lui-même.

## Correctif collision 2 (superviseur, même date)

AUDIT git status #38 : `components/ui/nav-user.tsx` est AUSSI modifié en vol par #38 —
il REJOINT la clause EXCEPTION COLLISION : interdit à #44 avant merge #38 + rebase,
puis delta borné re-gaté (avec create-email.tsx). EN REVANCHE `components/ui/app-sidebar.tsx`
n'est PAS dans le batch #38 (fichier #34, interdit à #38) : il REPASSE en extension
immédiate. Clarification de chemins (le rendu markdown avait avalé les astérisques) :
« icons/animated » et « theme » désignent les DOSSIERS COMPLETS `components/icons/animated/`
et `components/theme/`.

État consolidé du may-touch étendu #44 :

- IMMÉDIAT : `components/ui/app-sidebar.tsx`, `components/mail/mail.tsx`,
  `app/(routes)/mail/[folder]/page.tsx`, `app/entry.client.tsx`,
  `components/icons/animated/` (dossier), `components/theme/` (dossier) —
  imports lazy / éviction motion uniquement.
- POST-#38 (merge + rebase + delta borné re-gaté) : `components/create/create-email.tsx`,
  `components/ui/nav-user.tsx`.

## Ruling #6b lazy-IA (orchestrateur, 2026-07-13)

Faisabilité vérifiée par le builder (7 fichiers, conversions function-scoped sûres) MAIS
bénéfice non mesurable au harnais R10 prescrit (warm ≈ 0 grâce à #31 ; dry-run total
inchangé — les warmups du protocole masquent par construction le démarrage froid).
DÉCISION : pas de churn sans preuve. #6b n'est livré QUE si un protocole de mesure
COLD BOOT le justifie : ≥5 démarrages frais de wrangler dev, temps au premier
byte de la première requête, médiane avant/après. Si delta ~0 → NE PAS convertir ;
documenter « verified-no-op » (faisabilité + absence de gain mesurable) et router
l'affinage du protocole à #40 (bench M1). #6a (wrapper 60s, mesuré 2756,17→2743,25 KiB)
reste acquis. Jurisprudence : verify-don't-build (#34 D1).
