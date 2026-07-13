# Brouillons de checks — vague 3 perf (w3b / w3f / w3h) — NON GELÉS

*Handover pour le gel niveau9 (ou reprise perf). Rédigés le 2026-07-12 après le
merge w2d. **Baselines à re-snapshoter au moment du gel** — leçon du
stress-test (finding 0) : ne jamais geler des baselines contre un autre SHA
que celui du dispatch. Cibles grep vérifiées sur le tree `2979e92c`.*

## Commun aux trois slices (leçons stress-test intégrées)

- Garde périmètre : inclure `package.json` et `pnpm-lock.yaml` racine (finding 9).
- tsc : re-mesurer server/mail au gel (86/82 au 2026-07-12 — bougeront avec V1-V3).
- Env worktree : les fichiers générés gitignorés (`worker-configuration.d.ts`,
  `.react-router/`) faussent tsc — le préflight doit les régénérer
  (`react-router typegen`) ou documenter la procédure (oddity w2d).

## w3b-fiabilite-reseau (axes 7, 1)

Cibles vérifiées au 2026-07-12 :
- `providers/query-provider.tsx:53` : `retry: false` (global).
- `app/root.tsx:83` : `HydrateFallback` commenté.
- `use-threads.ts` : aucun `isError` consommé par mail-list/thread-display.

RUN (esquisse) :
- `grep -c "retry: false" apps/mail/providers/query-provider.tsx` → 0, ET grep
  d'un retry avec backoff (fonction `retryDelay`) présent → ≥1.
- `grep -c "isError" apps/mail/hooks/use-threads.ts` → ≥1, idem consommation
  dans `thread-display.tsx` et `mail-list.tsx`.
- `HydrateFallback` non commenté dans root.tsx (grep sur la ligne active,
  pas en commentaire : `grep -E "^\s*export function HydrateFallback"`).
Judge-only : backend coupé en serve local → liste = état d'erreur avec retry
(pas « It's empty here ») ; fil = erreur (pas skeleton infini) ; corps de mail
avec placeholder pendant `processEmailContent`.
⚠️ Dépend de w2a (mêmes hooks réécrits par niveau9 V4/V5) — geler APRÈS.
⚠️ Reprise optimiste : mécanisme réel = overlay Jotai `optimisticActionsAtom`
(`components/mail/optimistic-thread-state.tsx`), PAS un patch de cache
`mail.get` (stress-test finding 7).

## w3f-serveur-sync (axes 8, 9)

Cibles vérifiées au 2026-07-12 :
- `main.ts:23-29` : imports statiques des workflows sync + agents au module
  d'entrée (stack IA transitive) — cible du lazy-import cold-start.
- `google.ts` : **0 occurrence de « batch »** — pas d'API batch Gmail.
- Backoff plat 60 s (revue F5) : emplacement exact à re-vérifier au gel (non
  retrouvé par grep simple le 2026-07-12 — ne pas geler ce check sans preuve).

RUN (esquisse) :
- grep import batch Gmail dans le workflow de sync → ≥1.
- grep 0 import statique du stack IA dans `main.ts` (liste des modules à
  établir par lecture du graphe d'import au gel).
- `wrangler deploy --dry-run --outdir /tmp/w3f-bundle` : taille du bundle
  serveur ≤ baseline gelée (mesurer la baseline AU GEL — jamais mesurée à ce
  jour, cf. « ce qui reste à mesurer » de la revue serveur).
- `sanitizeOutput` déjà conditionné par quick wins v0 (5cb35016,
  trpc-logging.ts réécrit) → GARDE anti-régression, pas objectif.
Judge-only : sync staging complète sans erreur ; TTFB froid ≤ 0,9 s (3
échantillons post-idle — NB : conditions PPT/warp-off, cf. perf-m1.md ; le
froid mesuré ce soir reste ~1,5 s, le levier lazy-import reste entier).
⚠️ Licence : `workflows/` sous en-tête restrictif Zero Email Inc.
⚠️ Axe 8 : la durée de sync n'a jamais été mesurée (M1 §sync PENDING) — un
check « durée ÷ 3 » sans baseline M1 n'est pas falsifiable ; geler plutôt des
checks structurels (batch, backoff, concurrence bornée) + mesure M2.

## w3h-envoi-optimiste (axe 5)

Cible vérifiée au 2026-07-12 :
- **`components/mail/reply-composer.tsx:222` : `await refetch()`** — c'est le
  reply-composer qui bloque, PAS `create/email-composer.tsx` (l'issue #14
  d'origine se trompait de fichier ; re-vérifier les deux au gel).

RUN (esquisse) :
- `grep -c "await refetch" apps/mail/components/mail/reply-composer.tsx` → 0.
- grep fermeture/état « Envoi… » avant la mutation (cible exacte à fixer une
  fois le composant relu au gel).
Judge-only : envoi perçu instantané en serve local ; undo-send 15 s intact ;
échec d'envoi → reprise visible (pas de perte silencieuse du brouillon).
⚠️ Chevauchement composer avec w3b (sauvegarde brouillon au démontage) —
partitionner les fichiers explicitement ou sérialiser w3h avant w3b.
