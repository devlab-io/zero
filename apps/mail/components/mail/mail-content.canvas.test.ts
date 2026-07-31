import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// r17b : garde structurelle de la CAUSE RÉELLE du blanc-sur-blanc staging/prod
// (mail Kura réel 19fb4a042f3a4c70, text/plain sans aucune couleur propre).
// Les règles du document extérieur posées sur l'ÉLÉMENT HÔTE d'un shadow root
// battent les règles :host normales du shadow (CSS Scoping) : l'ancien
// `dark:text-white` du div hôte faisait hériter du blanc à tout contenu sans
// couleur, sur le canevas blanc forcé — invisible en thème sombre, quel que
// soit le HTML servi. Le canevas appartient au shadow root (:host !important
// côté email-processor) ; l'hôte ne doit porter AUCUNE couleur de texte.

const mailContent = readFileSync(join(__dirname, 'mail-content.tsx'), 'utf8');

describe('hôte shadow DOM du corps de mail (r17b)', () => {
  it('le div hôte ne porte aucune classe de couleur de texte (thème sombre compris)', () => {
    expect(mailContent).not.toContain('dark:text-white');
    expect(mailContent).not.toContain('text-black');
  });

  it('la classe hôte layout reste en place (scroll/dimensions inchangés)', () => {
    expect(mailContent).toContain("'mail-content no-scrollbar w-full flex-1 overflow-scroll px-4'");
  });
});
