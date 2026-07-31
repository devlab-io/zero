/**
 * Chords composer Shortwave (r18) : mod+shift+C (Cc), mod+shift+B (Bcc),
 * mod+shift+A (pièce jointe), mod+shift+D ou mod+shift+, (jeter le brouillon).
 *
 * Résolution par `event.code` (position physique) et non `event.key` : ces
 * chords doivent fonctionner PENDANT la frappe dans l'éditeur/les champs, et
 * `shift+,` produit un caractère différent selon le layout (`?`, `;`, …) —
 * react-hotkeys-hook v5 n'a pas d'alias fiable pour la virgule. Pure et sans
 * DOM : la matrice complète est testée à part. ⌘ ou Ctrl sont acceptés sur
 * chaque plateforme : Dia intercepte notamment ⌘⇧C avant la page, alors que
 * Ctrl⇧C reste disponible comme le prévoit la documentation Shortwave.
 */

export type ComposerChordAction = 'toggleCc' | 'toggleBcc' | 'attachFile' | 'discardDraft';

export type ComposerChordEvent = {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function resolveComposerChord(
  event: ComposerChordEvent,
  _platformIsMac: boolean,
): ComposerChordAction | null {
  // Un seul modificateur principal : ⌘ OU Ctrl. Les deux simultanément restent
  // un raccourci système et ne déclenchent jamais ZERO.
  const hasMod = event.metaKey !== event.ctrlKey;
  if (!hasMod || !event.shiftKey || event.altKey) return null;

  switch (event.code) {
    case 'KeyC':
      return 'toggleCc';
    case 'KeyB':
      return 'toggleBcc';
    case 'KeyA':
      return 'attachFile';
    case 'KeyD':
    case 'Comma':
      return 'discardDraft';
    default:
      return null;
  }
}
