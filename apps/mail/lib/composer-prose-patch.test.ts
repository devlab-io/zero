// @vitest-environment jsdom
import { applyProseSuggestion } from './composer-prose-patch';
import { TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Editor } from '@tiptap/core';

/**
 * Test RÉEL sur un éditeur TipTap : la suggestion remplace UNIQUEMENT la
 * prose éditable — citation (avec son lien), signature après citation et
 * position de curseur sont préservées. Aucun setContent global.
 */

const RICH_CONTENT =
  '<p>Bonjour <a href="https://devlab.io">notre site</a></p>' +
  '<p>ancienne prose</p>' +
  '<blockquote><p>message cité avec <a href="https://client.pf">lien cité</a></p></blockquote>' +
  '<p>— Signature Devlab</p>';

const makeEditor = (content: string) =>
  new Editor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content,
  });

describe('applyProseSuggestion — patch borné, structure riche préservée', () => {
  it('replaces only the prose before the quote; quote link and signature survive', () => {
    const editor = makeEditor(RICH_CONTENT);
    applyProseSuggestion(editor, 'Nouvelle proposition.\nDeuxième ligne.');
    const html = editor.getHTML();
    // Prose remplacée…
    expect(html).toContain('Nouvelle proposition.');
    expect(html).toContain('Deuxième ligne.');
    expect(html).not.toContain('ancienne prose');
    expect(html).not.toContain('https://devlab.io');
    // …citation, SON lien et la signature STRICTEMENT préservés.
    expect(html).toContain('<blockquote>');
    expect(html).toContain('message cité avec');
    expect(html).toContain('https://client.pf');
    expect(html).toContain('— Signature Devlab');
    editor.destroy();
  });

  it('keeps the cursor inside the preserved quote when the selection was there', () => {
    const editor = makeEditor(RICH_CONTENT);
    // Place le curseur DANS la citation (sur « message cité »).
    let quoteTextPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (quoteTextPos === -1 && node.isText && node.text?.includes('message cité')) {
        quoteTextPos = pos + 3;
      }
    });
    expect(quoteTextPos).toBeGreaterThan(-1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, quoteTextPos)),
    );
    const textAtCursorBefore = editor.state.doc.textBetween(
      editor.state.selection.from,
      Math.min(editor.state.selection.from + 7, editor.state.doc.content.size),
    );

    applyProseSuggestion(editor, 'Prose bien plus courte.');

    // La sélection a été REMAPPÉE : le même texte logique est sous le curseur.
    const { from } = editor.state.selection;
    const textAtCursorAfter = editor.state.doc.textBetween(
      from,
      Math.min(from + 7, editor.state.doc.content.size),
    );
    expect(textAtCursorAfter).toBe(textAtCursorBefore);
    editor.destroy();
  });

  it('puts the cursor at the end of the inserted prose when the selection was in the replaced zone', () => {
    const editor = makeEditor(RICH_CONTENT);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
    applyProseSuggestion(editor, 'Texte final');
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 5), from);
    expect(before).toBe('final');
    editor.destroy();
  });

  it('without a quote, the whole document is treated as prose (explicit semantics)', () => {
    const editor = makeEditor('<p>seulement de la prose</p>');
    applyProseSuggestion(editor, 'remplacée');
    expect(editor.getText()).toBe('remplacée');
    editor.destroy();
  });

  it('an empty suggestion leaves a single empty paragraph, never a broken doc', () => {
    const editor = makeEditor(RICH_CONTENT);
    applyProseSuggestion(editor, '');
    expect(editor.getHTML()).toContain('<blockquote>');
    expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(3);
    editor.destroy();
  });
});
