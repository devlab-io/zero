# Cloudflare 10021 « Script startup exceeded CPU time limit » — bundle parse

**Symptôme (2026-07-30).** Deux `POST /versions` de zero-server-staging rejetés
avec l'erreur API 10021. Bundle 25 076 KiB / gzip 3 325 KiB. Les cpuprofiles
générés par wrangler montrent ~122–162 ms quasi intégralement en `(program)` :
du parse/compile V8, pas de l'exécution top-level identifiable. Le coût de
startup suit la **taille du bundle** — et `0873d407` passait à taille
identique : le seuil des 400 ms était frôlé, la variance a fait basculer.

**Cause.** `@datadog/datadog-api-client` pesait **9 163 KiB, 37 % du bundle**,
importé statiquement par `src/lib/datadog-service.ts` pour un unique
`v2.LogsApi.submitLog` — code de surcroît dormant ici (`DD_API_KEY` vide en
staging et prod). Wrangler 4 ne fait **pas** de code-splitting : même les
imports dynamiques (dub, react-email, cloudflare) sont inlinés dans `main.js`
et participent au parse de démarrage.

**Correctif.** Le SDK est remplacé par un `fetch` direct reproduisant son wire
format (POST `https://http-intake.logs.{site}/api/v2/logs`, header `DD-API-KEY`,
items HTTPLogItem avec `additionalProperties` aplati — vérifié dans les sources
du SDK 1.40.0). Dépendance retirée de `package.json`. Contrat verrouillé par
`src/lib/datadog-service.test.ts`.

**Mesure** (wrangler check startup, bundles pré-construits, 3 runs, médiane) :

|       | bundle     | gzip      | startup local |
| ----- | ---------- | --------- | ------------- |
| avant | 25 076 KiB | 3 325 KiB | 130,5 ms      |
| après | 15 760 KiB | 2 747 KiB | 98,9 ms       |

**Si 10021 revient un jour**, prochains leviers par ordre de masse : le SDK
`cloudflare` (1,7 Mo, un seul usage dans `bulk-delete.ts`), le cluster
react-email/prettier/react-dom (~2,7 Mo, campagne onboarding). Les sortir du
parse exige un vrai splitting (pré-bundler ces modules en fichiers autonomes
uploadés via `find_additional_modules`, ou build custom esbuild `--splitting`)
— structurel, à ne faire que si nécessaire. `fast-check` (184 KiB) vient
d'`effect` core : intouchable à bas coût.

**Reproduire la mesure :**

```sh
pnpm exec wrangler deploy --dry-run --outfile /tmp/w.bundle --env staging
pnpm exec wrangler check startup --worker /tmp/w.bundle --outfile /tmp/w.cpuprofile
```
