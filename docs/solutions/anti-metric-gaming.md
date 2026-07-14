# Solution — anti-metric-gaming : la mesure statique ne vaut pas les octets réseau

**Symptôme.** Une optimisation « prouvée » par une métrique statique (taille de bundle, nombre de
modules, présence d'un `preload`) qui, mesurée en conditions réelles, n'améliore rien — voire dégrade
(préchargement d'assets jamais utilisés sur le chemin froid).

**Diagnostic.** Une **mesure statique** (ce que le build déclare) n'est pas une **mesure réseau
froide** (ce que le navigateur télécharge réellement au premier chargement, cache vide). Un `preload`
ajouté « pour la métrique » gonfle le chemin critique sans intention de consommation ; c'est du
gaming, pas un gain.

**Correctif — règle actée (`f143abf9`, juge #44 + bench #40) :**

- Tout préchargement doit être **intent-based** (l'asset est consommé sur le chemin immédiat) **ou
  idle-justifié** (chargé pendant l'inactivité, sans peser sur le first paint).
- La preuve exigée est une **trace réseau froide** (cache vide), pas un chiffre de bundle statique.
- Une amélioration de poids ne compte que si elle se voit sur les **octets réseau** du parcours
  mesuré.

**Prévention.** Distinguer systématiquement « mesuré statiquement » de « mesuré réseau froid » dans
tout rapport perf. Le gate A8 se juge sur le poids réseau du chemin critique, pas sur la taille
déclarée du bundle. Source : ruling docs §3 (« anti-metric-gaming »), commit `f143abf9`.
