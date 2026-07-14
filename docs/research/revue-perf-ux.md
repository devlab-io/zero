# Revue complète perf & UX — post-vague 1 (2026-07-12)

*Branche `factory/perf`, après merge P0 client-weight (JS 5828→4183 kB, 0 chunk >900 kB).*
*Méthode : 5 revues parallèles indépendantes (poids client + build prod mesuré, couche data/runtime, serveur/sync, états UX, parcours UX + staging live). Les faits porteurs de chaque revue ont été contre-vérifiés dans le code par l'orchestrateur. Annexes complètes : `docs/research/revue-perf-ux/`.*
*Repères réseau (B1, `docs/research/perf-baseline.md`) : RTT Tahiti→edge 150–200 ms · TTFB API 0,18–0,6 s (1,6 s isolate froid) · débit descendant réel 44–340 kB/s.*

---

## Verdict exécutif

1. **Le classement B1 (P2 > P3 > P5 > P6 > P4) ne tient plus.** P2 (optimistic UI) est déjà livré à ~80 % (hub `useOptimisticActions` : lu, étoile, move, delete, label, snooze — tout est optimiste avec undo). P3 (préchargement) est un effet de bord de la sur-hydratation actuelle. P4 (virtualisation) est déjà en place (`virtua`). P5 : la sync est déjà en push websocket, sans polling client.
2. **Le vrai goulot n°1 n'était pas dans la liste : un double N+1 sur le chemin de lecture.** `listThreads` ne renvoie que des `{id, historyId}` ; chaque ligne visible fait alors son propre `mail.get` (fil COMPLET, corps et images base64 inclus) **plus** un appel `processEmailContent` (sanitisation du HTML que la liste n'affiche jamais) — sans batching HTTP (`maxItems: 1`). ~13 requêtes concurrentes au premier rendu, +2 par ligne au scroll, corps complets sur un lien à 44–340 kB/s. **Les métadonnées d'affichage existent déjà dans le SQLite des DO** (`latest_subject`, `latest_sender`, `latest_received_on`, indexés) : le serveur les jette. Convergence indépendante des revues client et serveur ; contre-vérifié (`query-provider.tsx:95`, `mail-list.tsx:62`, `use-threads.ts:65-83`).
3. **Le chemin critique client reste lourd : ~499 kB gz avant le premier pixel de l'inbox** (shell 371 kB gz via 45 modulepreload + chunk inbox 128 kB gz) = 1,5 à 11,3 s de réseau pur à Tahiti, écran blanc (`ssr:false`, `HydrateFallback` commenté). Dedans : PostHog+Sentry 56 kB gz et framer-motion 36 kB gz chargés inconditionnellement, `marked`+`highlight.js` dans le chunk d'ouverture d'inbox.
4. **Des monstres hors JS dorment dans public/** : 3 GIF d'onboarding de 10–19 MB (48 MB le parcours nouvel utilisateur — jusqu'à 7 min par GIF à 44 kB/s), icônes de pièces jointes « SVG » contenant du raster base64 (~460 kB par icône), ~9 MB d'images orphelines déployées.
5. **La fiabilité réseau UX est le défaut transverse n°1 à Tahiti** : `retry: false` global + erreurs de lecture silencieuses + liste sans état d'erreur → une coupure réseau affiche « It's empty here » ; un échec de fetch de fil affiche un skeleton infini. L'utilisateur croit sa boîte vide.
6. **La promesse keyboard-first fuit là où elle se joue** : réponse fraîche avec champ « À » vide (`replyingTo` déclaré mais jamais consommé par EmailComposer — contre-vérifié), double montage de `HotkeyProviderWrapper` (risque double-undo), raccourcis morts affichés dans les réglages, pas de `/` pour chercher, recherche IA par défaut (contraire à la règle des 100 ms).
7. **i18n en trompe-l'œil** : `fr.json` complet (659 clés), mais 62 toasts, les états vides, l'onboarding entier et l'ErrorBoundary sont codés en dur en anglais — le feedback aux moments critiques échappe à la traduction. 19 locales embarquées pour un usage fr/en.

---

## Backlog priorisé — candidats vague 2

| Rang | Chantier | Contenu | Gain attendu (Tahiti) | Sév. | Effort |
|---|---|---|---|---|---|
| 1 | **W2-A Lecture-liste** | Projection riche `listThreads` (sujet, expéditeur, date, snippet, labels depuis le SQLite DO) ; `processEmailContent` gelé au fil actif ; corps chargé à l'ouverture seulement ; `LIMIT` SQL 1ʳᵉ page | Supprime ~13–50 `get` + autant de sanitisations par affichage ; le plus gros gain du parcours authentifié | P0 | M/L |
| 2 | **W2-B Fiabilité réseau UX** | Retry ciblé sur les lectures ; état d'erreur liste + thread (fin du « empty » mensonger et du skeleton infini) ; `HydrateFallback` réactivé ; placeholder corps de mail ; reprise (pas revert silencieux) des actions optimistes échouées ; sauvegarde brouillon au démontage | Une coupure réseau devient un état géré, plus un mensonge | P1 | M |
| 3 | **W2-C Chemin critique client** | PostHog/Sentry/framer-motion en import dynamique conditionnel (−92 kB gz) ; `manualChunks` ; `marked`+`highlight.js` hors chunk inbox et mutualisés ; prerender `/` (landing) | −0,3 à −2,1 s toutes pages ; premier pixel inbox nettement avancé ; landing visible avant JS | P1 | M |
| 4 | **W2-D Médias monstres** | GIF onboarding → `<video>` (−45 MB) ; icônes PJ → vrais SVG (−4,4 MB) ; suppression orphelins (9 MB img + 720 kB TTF + 195 kB CSS) ; pricing-gradient + nizzy → WebP | Onboarding : de minutes à secondes ; hygiène de déploiement | P0 ponctuel | S/M |
| 5 | **W2-E Confiance clavier** | Reply « À » pré-rempli ; dédoublonner `HotkeyProviderWrapper` ; `handleNext` post-archive fiabilisé ; retirer/câbler les raccourcis morts (`1-6`, `v`) ; overlay `?` en contexte ; `/` → recherche | La promesse produit (vitesse au clavier) redevient fiable | P1 | M |
| 6 | **W2-F Serveur & sync** | Batch Gmail API (2000 appels → ~20) + concurrence bornée + backoff exponentiel (vs 60 s plat) + fin du polling plancher 5 s/page ; lazy-import du stack IA (cold start −~1 s) ; auth singleton ; mémoïsation shard/connexion ; `sanitizeOutput` conditionné (clone inutile sur chaque réponse) | Sync initiale plusieurs fois plus rapide ; TTFB à froid réduit | P1 | M/L |
| 7 | **W2-G Feedback i18n & onboarding** | Toasts/états vides/onboarding via paraglide ; locales 19→2 (fr, en) ; progression visible pendant la sync initiale | Premier contact cohérent en français ; ~40–80 kB gz en moins | P2 | M |
| 8 | **W2-H Envoi optimiste** | Fermeture immédiate du composer, état « Envoi… », retrait du `await refetch()` bloquant | −0,2 à −1,6 s perçus par envoi (seule action encore bloquante) | P2 | M |

Quick wins transverses (heures, hors vagues) : réactiver `HydrateFallback` ; imports dynamiques PostHog/Sentry ; suppression des orphelins ; icônes PJ ; locales 19→2 ; retrait des `console.log` des chemins chauds (frappe clavier, liste, mutations serveur) ; `LIMIT` SQL ; `sanitizeOutput` dans le `if`.

---

## Ce qui est déjà bon (à préserver)

- **Optimistic UI** : hub central `useOptimisticActions` couvrant 10 actions, avec undo 5 s et appel serveur différé après la fenêtre d'annulation — pattern plus fort que `onMutate`+rollback.
- **Undo send** (15 s, restauration du compose), **schedule send**, autosave brouillon (3 s), nudge « pièce jointe oubliée », protection double-submit.
- **Virtualisation** liste (`virtua`, overscan 5) ; éditeur TipTap lazy ; archive→fil-suivant câblé façon Superhuman.
- **Cache local-first** (P1 upstream) : PersistQueryClientProvider + idb, 24 h, buster — réouverture instantanée depuis le cache ; les `mail.get` (staleTime 1 h) survivent → fil déjà vu consultable hors-ligne.
- **Sync push** : websocket DO (aucun polling client, `refetchInterval` : 0 occurrence).
- **Queue/outbox** (`queue-review.tsx`) : loading + erreur avec retry + vide, tout i18n — le patron à répliquer partout.
- Landing staging saine au live : TTFB 725 ms, domReady 1,5 s, 0 erreur console, responsive propre.

## Ce qui reste à mesurer (non concluable en lecture seule)

- Parcours authentifié réel (ouverture de fil, payloads `mail.get` moyens, Hyperdrive froid/chaud) — session Google requise, mesure manuelle avec Thomas (blocage identique à B1 §5).
- Taille réelle du bundle serveur et part parse vs exécution dans le +1 s de cold start (`wrangler deploy --dry-run --outdir`).
- Durée réelle d'une sync initiale 2000 threads + taux de 429 Gmail (logs d'observabilité).
- Reply-« À »-vide : vérifié au niveau code, à confirmer en session live avant correction.

## Annexes (rapports complets, constats fichier:ligne)

- `revue-perf-ux/revue-perf-bundle.md` — poids client résiduel, chemin critique, build mesuré (15 constats)
- `revue-perf-ux/revue-perf-data.md` — couche data, N+1, optimistic UI, classement révisé (10 constats)
- `revue-perf-ux/revue-perf-server.md` — cold start, sync Gmail, chemin de lecture, payloads (16 constats)
- `revue-perf-ux/revue-ux-states.md` — états loading/vide/erreur/offline par surface, i18n, a11y (20 constats + tableau 13 surfaces × 7 états)
- `revue-perf-ux/revue-ux-flows.md` — raccourcis, palette, triage, compose, recherche, mobile, staging live (15 constats)
