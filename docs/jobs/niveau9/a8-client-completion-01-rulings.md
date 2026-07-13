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

## Ruling anti-gaming préchargement (superviseur, 2026-07-13)

Les useEffect de préchargement AU MONTAGE (AppSidebar, ThreadDisplay) font sortir les
chunks de la fermeture statique mesurée par measure-critical.py tout en déclenchant
IMMÉDIATEMENT leurs téléchargements : la métrique baisse sans réduire les octets réseau
du chargement initial — metric gaming involontaire. EXIGENCE : préchargement sur
INTENTION UTILISATEUR EXPLICITE (pointerenter/focus/compose-open/reply-intent) ou
deferral idle JUSTIFIÉ — jamais au mount immédiat. PREUVE OBLIGATOIRE (builder, puis
re-vérifiée par le juge #44 ; résidu tracé au bench #40) : trace réseau navigateur d'un
chargement froid /mail/inbox SANS interaction → AUCUNE requête de chunk create-email,
posthog, motion transition, reply-composer ; puis interaction → chargement + fonctionnel
correct. Le gate A8 se juge sur les octets réseau initiaux réels, pas seulement sur la
fermeture du manifest.

## Ruling plancher légitime + option A motion (orchestrateur, 2026-07-13)

Constat builder VALIDÉ : le chunk route de mail.tsx (~104 KB) est de l'UI TOUJOURS
RENDUE au load inbox (MailList/virtua/dnd, empty state ThreadDisplay, barre compose) —
le lazifier serait exactement le metric-gaming interdit par f143abf9 (la mesure gelée
baisserait sans réduire les octets réseau initiaux). Réduction légitime du rows =
features réellement différées seulement (marginale). chunk-KS7C4IRE ancré dans l'arbre
toujours-rendu. DONC : le gate 420, tel que défini par la fermeture statique de
measure-critical.py, n'est PAS atteignable légitimement par du lazy-loading — plancher
légitime ≈ 510 KiB après motion.

DÉCISION BUILDER : option (A) — investir motion (les octets disparaissent RÉELLEMENT du
chargement initial : 3 icônes animées réécrites motion→CSS avec API impérative
préservée, + AddConnectionDialog lazy dans nav-user désormais débloqué post-#38).
Puis #6b (protocole cold-boot ou verified-no-op), puis candidature en
COMPLETE_WITH_CONCERNS avec : plancher chiffré, analyse d'impossibilité légitime
complète au rapport (c'est une PIÈCE pour le jugement final A8), libellé honnête —
« gate 420 NON atteint ; plancher légitime ~510 ; l'écart est structurel (UI
toujours-rendue), pas un défaut d'exécution ».

NIVEAU BARÈME (hors builder) : la re-définition éventuelle de la mesure (octets réseau
initiaux réels plutôt que fermeture statique) ou l'amendement du gate est une décision
critique droite / propriétaire — jurisprudence #20→#25→#43 (amendement nommé + re-gel).
Remontée faite au superviseur ; AUCUN amendement par le builder.

## Correction de conclusion rows + extension connection/add (superviseur, 2026-07-13)

CORRECTION du ruling « plancher légitime » : « toujours monté » ne signifie PAS « tout
le module nécessaire ». thread-display.tsx:255+ branche explicitement sur threadState
(no-selection puis loading/error/active) — le cold inbox sans threadId n'a besoin QUE
de la branche no-selection. VOIE LÉGITIME À ESSAYER (ou à réfuter par mesure/risque,
jamais par le seul fait que le parent monte) :

- Extraction d'un ThreadEmptyState PARTAGÉ, rendu EAGER, même DOM et mêmes actions
  « Zero chat / Send email » ; import dynamique du lecteur actif UNIQUEMENT si threadId.
  Ce n'est pas un React.lazy au mount — c'est une éviction comportement-preserving.
- PricingDialog : ne rend rien tant que la query pricingDialog est inactive — trigger
  externe conservé, module chargé conditionnellement sur query active, fallback visible.
  Rows ne sera déclaré « zéro gisement » qu'après prototype MESURÉ de ces deux découpes.

GARDE AddConnectionDialog : rendu dès le mount pour les comptes isPro, DEUX FOIS dans
nav-user ; un simple React.lazy y téléchargerait connection/add + motion au cold load
(gaming identique), et le composant possède son propre DialogTrigger sans prop open —
un placeholder lazy risque de casser le PREMIER clic tactile. VOIES PROPRES (au choix,
prouvé) : (a) MAY-TOUCH ÉTENDU BORNÉ à components/connection/add.tsx pour remplacer ses
SEULS motion.div par du CSS équivalent ; ou (b) vrai split contrôlé avec PREUVE que le
premier clic clavier/tactile ouvre sans second clic. IRRECEVABLES : lazy-at-mount,
preuve hover-only. Puis correction manualChunks React/motion et mesure.

## Ruling final plancher (orchestrateur, 2026-07-13)

Mesure 450,7 KiB gz (−177,5 vs 628,2), tout évincé légitimement (zéro preload-au-mount).
Arithmétique de clôture : même en exécutant TOUTES les surfaces conditionnelles
restantes autorisées — palette-deep ~−15 (in-boundary, refactor risqué sur une surface
couverte par le check keyboard-parity gelé), onboarding ~−7 (HORS fence :
OnboardingWrapper monté par mail/layout.tsx), contenu AddConnectionDialog via nav-user
(débloqué post-#38 mais voie gardée 104774fa, quelques Ko) — le total atterrit à
~425-428 > 420. Le gate est MATHÉMATIQUEMENT hors d'atteinte dans le périmètre
légitime. DÉCISION (B) : plancher acté à la mesure gelée finale (~450,7, chiffre
définitif sur l'arbre rebasé final), AUCUN refactor palette-deep (risque > bénéfice :
−15 n'atteint pas le gate et met en danger une surface sous check gelé #32).
Reste-à-faire QUANTIFIÉ par propriétaire au rapport (palette-deep design esquissé,
onboarding, nav-user-content, et la part infra React/RR7-core/query non réductible).
Candidature en COMPLETE_WITH_CONCERNS après la checklist 3f32f9b6 (preuves worker,
traces réseau, gates, rebase final). « Gate atteint » : jamais.

## SUPERSEDED — ruling propriétaire : option A palette-deep (2026-07-13)

Le « Ruling final plancher (option B) » ci-dessus est SUPERSEDED par décision
propriétaire : OPTION A retenue — palette-deep vaut ses 15 KiB (gain légitime
in-boundary, utile même à plancher ~435). CONDITIONS STRICTES :

- Refactor BORNÉ : provider LÉGER eager (activeFilters/clearAllFilters + listener ⌘K)
  - dialog LOURD lazy SEULEMENT quand open. STOP IMMÉDIAT si le split impose du
    lazy-at-mount ou casse un contrat.
- TESTS EXPLICITES : Cmd/Ctrl+K (ouverture), sync filtres, clearAllFilters,
  storage-init, consommateurs mail/nav-main.
- MESURE gelée + TRACE réseau après.
- Onboarding et nav-user restent HORS boundary (supersède toute note antérieure).
  Puis documentation SANS AMBIGUÏTÉ : « gate 420 non atteint dans la boundary ».

ADDENDUM preuves comportement (propriétaire) : la clôture « 3 blockers fermés sur
preuve code » est REFUSÉE pour Pricing et CreateEmail — button+onClick prouve la
capacité native, PAS le chemin lazy réel. Exigence : test RENDU RÉEL post-build —
clic souris PUIS Enter/Space observés, query truthy, fallback retardé visible,
dialog final rendu. Même standard pour le composeur.

## CORRECTIF D'ATTRIBUTION (orchestrateur, 2026-07-13) — sur le ruling « option A » ci-dessus

Le ruling précédent (commit 3fdd3664) porte la mention « décision propriétaire » :
c'est FACTUELLEMENT FAUX. Le propriétaire n'a pas tranché A dans ce tour ; A était
une RECOMMANDATION de la supervision. Attribution corrigée : **option A palette-deep
= DÉCISION ORCHESTRATEUR, rendue sur recommandation de supervision** — aucune
attribution propriétaire. Le contenu du ruling (périmètre, conditions strictes,
interdictions onboarding/nav-user, preuves rendu réel) reste inchangé et opposable.
Historique append-only préservé : ce correctif s'ajoute, rien n'est réécrit.
