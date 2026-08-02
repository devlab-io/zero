import { TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';

/**
 * Application d'une suggestion de relecture (P15, durci) — patch BORNÉ à la
 * zone de prose éditable, jamais un remplacement silencieux du document.
 *
 * Sémantique : la « prose éditable » d'une réponse est tout ce qui précède le
 * PREMIER blockquote top-level (la citation) ; la citation, tout ce qui la
 * suit (signature comprise) et leur mise en forme riche (liens, marques)
 * sont STRICTEMENT préservés par une transaction ProseMirror ciblée — pas de
 * setContent global. Destinataires, objet et pièces jointes vivent hors du
 * document : intouchés par construction.
 *
 * Curseur : si la sélection était dans la prose remplacée, elle est posée à
 * la fin du texte inséré ; si elle était dans la partie préservée (citation,
 * signature), ProseMirror la REMAPPE — elle reste au même endroit logique.
 */
export function applyProseSuggestion(editor: Editor, text: string): 'inserted' {
  const { state } = editor;
  const { doc, schema } = state;

  let boundary = doc.content.size;
  let found = false;
  doc.forEach((node, offset) => {
    if (!found && node.type.name === 'blockquote') {
      boundary = offset;
      found = true;
    }
  });

  const paragraphType = schema.nodes['paragraph'];
  if (!paragraphType) return 'inserted';
  const paragraphs = text
    .split('\n')
    .map((line) => paragraphType.create(null, line.length > 0 ? schema.text(line) : undefined));
  const fragment = Fragment.from(paragraphs.length > 0 ? paragraphs : [paragraphType.create()]);

  const selectionWasInProse = state.selection.from <= boundary;
  const tr = state.tr.replaceWith(0, boundary, fragment);
  if (selectionWasInProse) {
    const endOfProse = Math.min(fragment.size, tr.doc.content.size);
    tr.setSelection(TextSelection.near(tr.doc.resolve(endOfProse), -1));
  }
  editor.view.dispatch(tr);
  return 'inserted';
}
