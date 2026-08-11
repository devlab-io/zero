import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Le canevas thémé appartient au shadow root (:host !important côté serveur).
// L'hôte React ne doit porter aucune couleur susceptible de le renverser.

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
