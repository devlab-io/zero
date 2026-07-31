import { resolveComposerChord, type ComposerChordEvent } from './composer-chords';
import { describe, expect, it } from 'vitest';

// r18 : matrice complète des chords composer — résolution par event.code
// (layout-indépendant), ⌘/Ctrl stricts, shift requis, alt exclu.

const event = (code: string, overrides: Partial<ComposerChordEvent> = {}): ComposerChordEvent => ({
  code,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe('resolveComposerChord', () => {
  it('macOS : ⌘+shift+lettre résout chaque action ; Comma et KeyD → discardDraft', () => {
    const mac = (code: string) =>
      resolveComposerChord(event(code, { metaKey: true, shiftKey: true }), true);
    expect(mac('KeyC')).toBe('toggleCc');
    expect(mac('KeyB')).toBe('toggleBcc');
    expect(mac('KeyA')).toBe('attachFile');
    expect(mac('KeyD')).toBe('discardDraft');
    expect(mac('Comma')).toBe('discardDraft');
    expect(mac('KeyX')).toBeNull();
  });

  it('Ctrl+shift reste disponible sur macOS/Dia et ailleurs', () => {
    expect(resolveComposerChord(event('KeyC', { ctrlKey: true, shiftKey: true }), false)).toBe(
      'toggleCc',
    );
    expect(resolveComposerChord(event('Comma', { ctrlKey: true, shiftKey: true }), false)).toBe(
      'discardDraft',
    );
    expect(resolveComposerChord(event('KeyC', { ctrlKey: true, shiftKey: true }), true)).toBe(
      'toggleCc',
    );
    expect(resolveComposerChord(event('KeyC', { metaKey: true, shiftKey: true }), false)).toBe(
      'toggleCc',
    );
  });

  it('mod STRICT : l’autre modificateur présent = raccourci système, jamais le nôtre', () => {
    expect(
      resolveComposerChord(event('KeyC', { metaKey: true, ctrlKey: true, shiftKey: true }), true),
    ).toBeNull();
    expect(
      resolveComposerChord(event('KeyC', { ctrlKey: true, metaKey: true, shiftKey: true }), false),
    ).toBeNull();
  });

  it('shift requis, alt exclu', () => {
    expect(resolveComposerChord(event('KeyC', { metaKey: true }), true)).toBeNull();
    expect(
      resolveComposerChord(event('KeyC', { metaKey: true, shiftKey: true, altKey: true }), true),
    ).toBeNull();
  });

  it('sans aucun modificateur : null (la frappe normale ne déclenche jamais)', () => {
    for (const code of ['KeyC', 'KeyB', 'KeyA', 'KeyD', 'Comma']) {
      expect(resolveComposerChord(event(code), true)).toBeNull();
      expect(resolveComposerChord(event(code), false)).toBeNull();
    }
  });
});
