# Rulings — server-console-sweep-01 (issue #42)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch — carve-out routes/agent/\*\* (2026-07-13, directive propriétaire)

L'edge blocked-by #36 existe parce que #42 et #36 toucheraient tous deux
`routes/agent/**`. Sur directive propriétaire (dispatch V5 complet, builders Fable
uniquement), #42 part EN PARALLÈLE de #36 avec amendement de frontière MINIMAL :

- Périmètre -01 : `lib/driver/**` (45 sites au gel), `workflows/**`,
  `thread-workflow-utils/**`, `pipelines.ts` — `routes/agent/**` EXCLU intégralement
  (possédé par #36 cette vague, y compris ses sites console).
- Conséquence d'honnêteté : la cible A5 « serveur ≤20 » n'est PAS atteignable par -01
  seul (81 sites routes/agent restants). Le rapport -01 donne le comptage gelé RÉEL
  post-passage et le libellé reste « residuel routes/agent → -02 » ; JAMAIS « ≤20
  atteint » tant que ce n'est pas littéralement vrai.
- Un -02 borné (routes/agent seulement) part après le merge de #36 ; la gate ≤20 reste
  portée nominalement par #42.
- Dette #31 rappelée : catch vide `lib/driver/google-threads.ts:181` doit être VRAIMENT
  traité (logger avec contexte, pattern #29) — pas seulement compté.
