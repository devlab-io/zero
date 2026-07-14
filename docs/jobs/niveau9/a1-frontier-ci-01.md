# Job A1 — frontier-ci-01 (vague V7a « niveau réel »)

- Branche : `job/niveau9/a1-frontier-ci-01`
- Gel HEAD : `375d1003b2f86ba53b28b5ef6e7b2d48c75fb320`
- Cadre : `docs/jobs/niveau9/v7-wave-rulings.md` (aucun push/PR/deploy — gain réel local)
- Cible : les 2 manquants A1 du jugement final (note 8,0 → palier 9).

---

## PHASE 0 — Plan + désaccords

### Lecture opposable retenue
- Ruling A1 (v7-wave-rulings §6-7) : **pas de barrels inutilisés pour le score**. Un index
  n'est légitime que s'il porte une VRAIE frontière ET est CONSOMMÉ. Sinon → documenté cosmétique.
- Fence a1 (§17-19) : périmètre = `.github/workflows/ci.yml`, config lint
  (`packages/eslint-config`, `.oxlintrc.json`), + investigation index de domaines.

### Plan
1. **MANQUANT 1 (−0,5) — règle no-restricted-imports non exécutée en CI.**
   La règle existe (`packages/eslint-config/config.ts:27`) mais `ci.yml` ne lance jamais
   eslint (seul oxlint sur 7 fichiers sécurité). → Ajouter un step CI qui EXÉCUTE réellement
   la frontière sur `apps/mail`. Deux voies évaluées (a) eslint ciblé, (b) oxlint. Décision
   au banc d'essai (mesure durée + green-on-healthy + red-on-violation).
2. **MANQUANT 2 (−0,5) — « components/ organisé par domaine avec index ».**
   Investigation d'abord : `components/` est-il déjà par domaine ? Un index consommé
   apporte-t-il une frontière réelle sans réécriture massive d'imports produit ? Décision au
   rapport ; si legit → sous-ensemble minimal + attente ruling ; sinon → cosmétique documenté.

### Désaccords / points de vigilance signalés
- **Désaccord avec l'option (a) telle que formulée** : `eslint .` sur `apps/mail` n'est PAS
  un gate viable — mesuré à 142 erreurs préexistantes hors périmètre (react/tseslint) sur
  l'arbre sain, donc rouge d'entrée. Un eslint « ciblé sur la seule règle » exigerait une
  config eslint dédiée + jiti, pour un résultat 40× plus lent qu'oxlint. Je tranche pour (b).
- **Frontière ≠ barrels** : la vraie frontière (front→serveur) est architecturale et se garde
  par une règle d'import, pas par des `index.ts`. Les barrels de domaine dans `components/`
  seraient cosmétiques ET nuisibles (tree-shaking/HMR Vite). Je le documente, je ne l'exécute pas.

---

## MANQUANT 1 — CORRECTIF (exécuté)

### Décision : option (b) — step oxlint avec config frontière dédiée
Fichier ajouté `packages/eslint-config/oxlint-frontier.json` :
```json
{ "categories": { "correctness": "off" },
  "rules": { "no-restricted-imports": ["error",
    { "patterns": [{ "group": ["**/server/src/**"], "message": "…issue #25" }] }] } }
```
Step CI ajouté dans `.github/workflows/ci.yml` (après « Lint security-critical files ») :
```
pnpm dlx oxlint@1.9.0 --config packages/eslint-config/oxlint-frontier.json apps/mail
```

### Pourquoi (b) et pas (a) — le plus sûr ET le plus rapide
| Critère | (a) `eslint .` apps/mail | (b) oxlint frontier dédié |
|---|---|---|
| Durée | **4,25 s** (mesurée) | **~0,1 s** oxlint / 1,4 s wall (353 fichiers) |
| État arbre sain | **142 erreurs, 51 warnings** → ROUGE | **0/0** → VERT |
| Pollution règles tierces | oui (react/tseslint) | non (`correctness=off` + 1 seule règle) |
| Toolchain CI | eslint absent de CI (nouveau) | oxlint déjà en CI (cohérent) |
| Support règle | — | `no-restricted-imports` supporté par oxlint 1.9.0 (vérifié) |

### Preuves ± (RC natifs, non masqués)
- **Support oxlint 1.9.0** : `no-restricted-imports` avec `patterns/group` matche
  `../sub/server/src/secret`, ignore un import sain — 13 ms.
- **Isolation** : `--config …/oxlint-frontier.json` sur un fichier réel `apps/mail` →
  `Finished … with 1 rules` (le `.oxlintrc.json` racine à ~15 règles n'est PAS fusionné).
- **Positif** : frontier oxlint sur **tout apps/mail (353 fichiers)** → `0 warnings, 0 errors`,
  **exit 0**.
- **Négatif** : sonde jetable `apps/mail/components/__frontier_probe__.tsx` avec
  `import … from '../../server/src/lib/secret'` → `1 error`, message frontière exact,
  **exit 1**. Sonde supprimée → **exit 0**, arbre propre (`git status` vide).
- **Robustesse exit** : violation seule → exit 1 ; sain +/− `--deny-warnings` → exit 0 ;
  fichier `debugger` seul sous config frontière → 0 warning (categories off effectif).

---

## MANQUANT 2 — INVESTIGATION + DÉCISION : cosmétique documenté

### Constats mesurés
- `components/` est **déjà organisé par domaine** : 16 dossiers (`ui` 61 fichiers, `mail` 50,
  `create` 26, `icons` 14, `context` 12, `home` 10, + settings/labels/pricing/queue/theme/
  connection/cookies/providers/magicui/motion-primitives). Le critère « par domaine » est
  DÉJÀ satisfait ; seul « avec index » manque.
- **Aucun** `index.ts`/`index.tsx` dans `components/`.
- **289 sites d'import** `@/components/…`, **tous en chemin profond** (`@/components/<dom>/<fichier>`).
  Les seuls imports « racine » (8) visent des fichiers unitaires (`navigation`, `onboarding`,
  `keyboard-layout-indicator`), pas des barrels de domaine. **Zéro** consommation passerait
  par un index aujourd'hui.

### Décision : cosmétique (aucun index créé)
Aucun sous-domaine ne permet un index « consommé + frontière réelle sans réécriture massive » :
- Rendre un index consommé (ex. `ui/`) imposerait de réécrire ~200 imports produit
  → viole la boundary MUST NOT (code produit) pour un gain de frontière nul (limite intra-app,
  pas un bord de package).
- Créer les index sans réécrire = **barrels inutilisés** → exactement l'anti-pattern proscrit
  par le ruling A1.
- Coût technique négatif en stack Vite/react-router : un barrel de 61 modules élargit les
  frontières HMR et dégrade la granularité de tree-shaking.
- La frontière qui compte (front→serveur, `@zero/types` / sous-chemins publics `@zero/server/*`)
  est **déjà** un vrai bord de package, désormais gardé en CI par le correctif MANQUANT 1.

→ Critère « avec index » classé **cosmétique**, digne d'issue documentée, non exécuté.
Aucun ruling orchestrateur requis (option a écartée, aucune exécution d'index).

---

## RC (risques / constats)
- `pnpm dlx oxlint@1.9.0` en CI dépend du réseau — cohérent avec le step existant qui l'utilise
  déjà ; pas de régression d'hypothèse.
- Duplication mineure du pattern `**/server/src/**` entre `config.ts` (eslint, dev local) et
  `oxlint-frontier.json` (CI). Assumée et documentée ; les deux citent issue #25. Drift possible
  si l'un évolue sans l'autre — surface d'1 ligne, faible.
- La config frontière volontairement SANS `--deny-warnings` : seule la règle (error) gate, pas
  de couplage aux warnings par défaut d'oxlint.

## Gates
- tsc : `typecheck-report [blocking]` → server 0/0, mail 0/0, **no regression**, exit 0.
- pnpm test : voir STATUS (fan-in).
- Nouveau step lint : prouvé ± (positif exit 0 / négatif exit 1).
- ci.yml : YAML valide (19 steps parsés), step frontier bien placé.

## MIRROR: ORCHESTRATOR
- Livrable local uniquement, aucun push/PR/deploy (conforme cadre V7).
- MANQUANT 1 fermé (correctif prouvé). MANQUANT 2 = décision cosmétique documentée, pas d'exécution.
- Boundaries respectées : touché `.github/workflows/ci.yml`, `packages/eslint-config/oxlint-frontier.json`,
  ce doc. Aucun code produit, lockfile, `docs/checks/**`, `scripts/checks/**`.

## STATUS
Voir rapport team-lead (fan-in).
