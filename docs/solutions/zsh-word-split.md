# Solution — fichier parasite créé par le word-splitting zsh (liste de locales)

**Symptôme.** Une commande qui itère sur une liste de locales (ou tout contenu multi-mots)
crée un **fichier parasite** dont le nom est un fragment de la liste, ou n'itère que sur le premier
élément.

**Diagnostic.** Contrairement à bash, `zsh` ne fait **pas** de word-splitting sur les variables non
quotées par défaut. Un script écrit pour bash (`for x in $LIST`) se comporte différemment sous zsh :
la variable est traitée comme **un seul mot**, d'où un fichier au nom concaténé, ou une seule
itération.

**Correctif.**

- Toujours **quoter** et itérer explicitement, sans dépendre du splitting implicite :

  ```bash
  # au lieu de : for l in $LOCALES
  for l in ${(f)LOCALES}       # zsh : split sur newline, explicite
  # ou, portable :
  printf '%s\n' "$LOCALES" | while IFS= read -r l; do … ; done
  ```

- Ou forcer le comportement bash : `setopt shwordsplit` en tête de script zsh.

**Prévention.** Ne jamais supposer le word-splitting dans un script destiné à tourner sous le shell
interactif de l'opérateur (zsh ici). Source : ruling docs §3 (« zsh-word-split »).
