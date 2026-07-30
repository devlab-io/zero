import { shouldSuppressOpeningKey } from '@/lib/hotkeys/opening-key-guard';
import { Plugin } from 'prosemirror-state';
import { Extension } from '@tiptap/core';

/**
 * Filet transactionnel de la garde anti-écho (CUA round 4, échec 1).
 *
 * `handleTextInput` ne voit pas tous les chemins d'insertion réels : une frappe
 * synthétique (CDP/AX) peut entrer par l'observateur de mutations ou une
 * composition, et l'écho de la touche d'ouverture (a/r/f) atterrissait encore
 * dans le corps. `filterTransaction` est le dernier point de passage OBLIGÉ de
 * toute insertion, quel que soit le chemin DOM : une transaction qui n'insère
 * QUE le caractère gardé, fenêtre ouverte et sans keydown éditeur préalable
 * (qui désarme — voir opening-key-guard), est rejetée ; ProseMirror resynchronise
 * alors le DOM sur l'état, effaçant l'écho même déjà peint.
 */

/**
 * Texte inséré si la transaction est une insertion pure (aucune suppression),
 * sinon null. Duck-typing des ReplaceStep : `from === to` + slice textuel.
 */
export function pureInsertedText(tr: {
  docChanged: boolean;
  steps: readonly unknown[];
}): string | null {
  if (!tr.docChanged || tr.steps.length === 0) return null;
  let text = '';
  for (const step of tr.steps) {
    const s = step as {
      from?: number;
      to?: number;
      slice?: { content?: { size: number; textBetween: (a: number, b: number) => string } };
    };
    if (typeof s.from !== 'number' || typeof s.to !== 'number' || s.from !== s.to) return null;
    const content = s.slice?.content;
    if (!content || content.size === 0) return null;
    text += content.textBetween(0, content.size);
  }
  return text.length > 0 ? text : null;
}

export const OpeningKeyGuardExtension = Extension.create({
  name: 'openingKeyGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(tr) {
          const inserted = pureInsertedText(tr);
          if (inserted === null) return true;
          return !shouldSuppressOpeningKey(inserted);
        },
      }),
    ];
  },
});
