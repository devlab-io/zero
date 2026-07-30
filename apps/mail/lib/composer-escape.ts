/**
 * Décision Escape du composer (CUA 2026-07-30, échec 6).
 *
 * Reply inline : Escape sur un composer VIDE doit fermer sans créer ni envoyer
 * de brouillon ; un contenu non vide garde la confirmation de sortie. Le cas
 * `close` est borné au focus INTÉRIEUR au composer pour ne pas voler l'Escape
 * des surfaces posées par-dessus (pickers l/v, palette, dialogs).
 *
 * - contenu présent, pas de brouillon serveur → `confirm` (dialog de sortie) ;
 * - vide, focus dans le composer            → `close` (onClose, zéro brouillon) ;
 * - sinon                                    → `ignore` (l'événement suit son cours,
 *   ex. Radix ferme le dialog du composer plein écran).
 */
export function resolveComposerEscape(params: {
  hasContent: boolean;
  hasDraftId: boolean;
  targetInsideComposer: boolean;
}): 'confirm' | 'close' | 'ignore' {
  const { hasContent, hasDraftId, targetInsideComposer } = params;
  if (hasContent && !hasDraftId) return 'confirm';
  if (!hasContent && targetInsideComposer) return 'close';
  return 'ignore';
}
