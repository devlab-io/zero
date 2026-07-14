# Job niveau9/gitleaks-fix-01 — correctif faux positifs gitleaks (finding A7 du juge final)

MIRROR: ORCHESTRATOR
STATUS: COMPLETE

## Contexte

Reproduction convergente (orchestrateur + juge final) : le step CI gitleaks

```
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 dir /repo \
  --config /repo/scripts/checks/gitleaks.toml --no-banner --redact --exit-code 1
```

échouait (RC=1) sur le checkout CI à cause de **2 faux positifs trackés**, introduits par
#39/#40 après la dernière vérification d'allowlist :

1. `apps/server/.dev.vars.example` — bloc de placeholders vides `KEY=""`. La règle
   `generic-api-key` matche par **bridging** : sur une valeur vide, les guillemets
   ouvrants/fermants adjacents entre deux lignes se rejoignent et le moteur capture le
   nom de variable de la ligne suivante comme « secret ». Le finding réel démarre à la
   **ligne 51** (`ANTHROPIC_API_KEY=""` → capture `GROQ_API_KEY=`), pas à PERPLEXITY
   comme initialement supposé — vérifié par inventaire JSON non masqué.
2. `docs/jobs/niveau9/agent-api-completion-01-checkrun.md:3` — l'en-tête d'évidence
   imprime `freeze_sha: <40-hex>` juste après un nom de fichier finissant par `…api.md`.
   Le mot-clé « api » adjacent à la chaîne 40-hex déclenche `generic-api-key`. C'est un
   **SHA de commit git**, jamais un secret.

## Correctifs (2, rien d'autre)

### 1. `apps/server/.dev.vars.example` — fix de CONTENU (préféré par le brief)

Décision fondée sur test empirique (4 variantes exécutées contre gitleaks) :

| Variante | Action | Résultat |
|---|---|---|
| A | baseline | RC=1 (reproduit) |
| B | retrait des guillemets sur TOUS les `KEY=""` | RC=0 mais ~30 lignes touchées (non trivial) |
| C | `# gitleaks:allow` inline sur la ligne 51 | **RC=0, 1 seule ligne** |
| D | retrait des guillemets sur ANTHROPIC seul | RC=1 — le match **se déplace** (bridging en cascade) |

La variante D prouve qu'un retrait de guillemets ligne-par-ligne est fragile (le match
glisse sur la paire suivante). La variante C est **triviale (1 ligne)**, fonctionne, et
c'est l'option qui **affaiblit le moins** la détection (une unique ligne d'un fichier
d'exemple, vs une allowlist path qui exempterait tout le fichier). Retenue :

```diff
-ANTHROPIC_API_KEY=""
+ANTHROPIC_API_KEY="" # gitleaks:allow — placeholder vide ; guillemets vides adjacents = faux positif bridging generic-api-key
```

Portée du non-affaiblissement : `gitleaks:allow` n'exempte que **cette ligne** de ce
fichier d'exemple (template, jamais de vrai secret). Tout le reste du fichier — et tous
les vrais fichiers d'env (`.dev.vars`, `.env`) — restent scannés par toutes les règles.

### 2. `scripts/checks/gitleaks.toml` — allowlist regex ULTRA-CIBLÉE pour les SHAs d'en-tête

Nouveau bloc `[[allowlists]]` (même style que l'entrée `i18n.lock` existante), scopé par
le **label littéral `freeze_sha:` + exactement 40 hex minuscules**, `regexTarget = "line"` :

```toml
[[allowlists]]
description = """
Evidence checkrun headers (docs/jobs/**/*-checkrun.md) print a git commit SHA as
`freeze_sha: <40-hex>` right after a check filename ending in "…api.md"; the "api"
keyword adjacent to the 40-hex string trips generic-api-key. A git SHA is never a
secret. Scoped by the literal `freeze_sha:` label + exactly 40 lowercase-hex chars
(regexTarget = line): pérenne for every checkrun, and cannot match a real credential.
"""
regexTarget = "line"
regexes = [
  '''freeze_sha: [0-9a-f]{40}''',
]
```

Justification : pérenne pour **tous** les checkruns (présents et futurs), sans path glob
`docs/**` (interdit) et sans désactivation de règle. Un vrai credential n'est jamais
préfixé par le label `freeze_sha:` ni de forme 40-hex-minuscule stricte.

Aucune allowlist large. Aucune entrée ne couvre `.env` / `.dev.vars` non-example :
ils restent détectables.

## Preuves (RC natifs non masqués)

### AVANT — RC=1, 2 findings

```
=== RUN CI EXACT (BEFORE) ===
INF scanned ~8736707 bytes (8.74 MB) in 506ms
WRN leaks found: 2
=== RC=1 ===

INVENTAIRE :
generic-api-key | apps/server/.dev.vars.example:51 | match='ANTHROPIC_API_KEY=""\nGROQ_API_KEY="'
generic-api-key | docs/jobs/niveau9/agent-api-completion-01-checkrun.md:3 | match='agent-api.md  freeze_sha: <40-hex git SHA>'
```

### APRÈS — RC=0, zéro finding (commande CI EXACTE, inchangée)

```
=== RUN CI EXACT (AFTER) ===
INF scanned ~8736814 bytes (8.74 MB) in 447ms
INF no leaks found
=== RC=0 ===
```

### Contrôle anti-régression (canary) — l'allowlist n'a rien affaibli

Canary exécuté **avec mes changements ACTIFS** (stasher retirerait l'allowlist à tester,
prouvant l'inverse) dans `.architect/tmp/canary.txt` (NON tracké, git-ignored, supprimé après).

**Passe 1 — détection générique intacte :** deux clés haute-entropie (source `/dev/urandom`)
insérées → toutes deux **DÉTECTÉES**, RC=1 :

```
=== CANARY SCAN (config avec mes changements) ===
WRN leaks found: 2
=== RC=1 ===
generic-api-key | .architect/tmp/canary.txt:4   (GENERIC_API_KEY, 40 chars aléatoires)
generic-api-key | .architect/tmp/canary.txt:6   (some_real_token, 40 chars aléatoires)
```

**Passe 2 — précision de l'allowlist freeze_sha :** même chaîne 40-hex sous deux labels :

```
ligne (a)  check_file: …/agent-api.md  freeze_sha: <40-hex>   → EXEMPTÉ (mon allowlist)
ligne (b)  some_api_secret: <40-hex>                          → DÉTECTÉ

=== RC=1 ===
generic-api-key | .architect/tmp/canary.txt:5   (some_api_secret — label != freeze_sha)
total findings dans canary.txt = 1
```

→ Mon allowlist exempte **uniquement** le label littéral `freeze_sha:` ; la chaîne 40-hex
identique sous un autre label reste détectée. Aucune brèche.

Canary supprimé, worktree renettoyé après test.

### Diff final

```
=== git status --porcelain ===
 M apps/server/.dev.vars.example
 M scripts/checks/gitleaks.toml

=== git diff --stat ===
 apps/server/.dev.vars.example |  2 +-
 scripts/checks/gitleaks.toml  | 13 +++++++++++++
 2 files changed, 14 insertions(+), 1 deletion(-)
```

Aucun artefact de scan tracké ni présent (`gitleaks-report*.json`, `*.log`) : vérifié, néant.

## Conclusion

Commande CI exacte : RC=1 → **RC=0**. Détection des vrais secrets prouvée intacte (canary
double passe). Diff microscopique, 2 fichiers, chirurgical. Pas de commit (laissé à l'orchestrateur).

Self-check du livrable : la commande CI exacte a été re-exécutée **avec ce rapport présent
dans l'arbre** (il sera scanné une fois committé) → RC=0. Un premier jet du rapport citait un
SHA tronqué (37 hex) près du mot « api » et retriggerait `generic-api-key` ; neutralisé en
placeholder `<40-hex git SHA>`. Le doc de rapport est donc lui-même propre.

STATUS: COMPLETE
