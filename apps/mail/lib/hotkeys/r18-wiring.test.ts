import { keyboardShortcuts } from '@/config/shortcuts';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// r18 : garde structurelle des liaisons hors binder générique (les
// comportements purs — chords, lien de fil, table par
// combinaison — sont prouvés dans leurs tests dédiés ; ici on fige les points
// de branchement dans les composants).

const read = (relative: string) => readFileSync(join(__dirname, '..', '..', relative), 'utf8');

const emailComposer = read('components/create/email-composer.tsx');
const threadHotkeys = read('lib/hotkeys/thread-display-hotkeys.tsx');

describe('chords composer r18 — câblage email-composer', () => {
  it('la racine du composer écoute les chords (résolution event.code)', () => {
    expect(emailComposer).toContain('onKeyDownCapture={handleComposerChordKeyDown}');
    expect(emailComposer).toContain('resolveComposerChord(event.nativeEvent, isMac)');
    // Le chord consommé ne fuit ni dans l'éditeur ni vers les binders globaux.
    const handlerIndex = emailComposer.indexOf('const handleComposerChordKeyDown');
    const block = emailComposer.slice(handlerIndex, handlerIndex + 900);
    expect(block).toContain('event.preventDefault();');
    expect(block).toContain('event.stopPropagation();');
  });

  it('les chords Cc/Cci ouvrent et focalisent le champ, comme Shortwave', () => {
    const handlerIndex = emailComposer.indexOf('const handleComposerChordKeyDown');
    const block = emailComposer.slice(handlerIndex, handlerIndex + 1_300);
    expect(block).toContain('setShowCc(true);');
    expect(block).toContain('ccInputRef.current?.focus()');
    expect(block).toContain('setShowBcc(true);');
    expect(block).toContain('bccInputRef.current?.focus()');
  });

  it('jeter le brouillon = suppression RÉELLE, dans l’ordre du cycle de vie', () => {
    const discardIndex = emailComposer.indexOf('const discardDraft = () => {');
    expect(discardIndex).toBeGreaterThan(-1);
    const block = emailComposer.slice(discardIndex, discardIndex + 600);
    const markIndex = block.indexOf('saveLifecycle.markClosed({ abandonedEmpty: true });');
    const snapshotIndex = block.indexOf('clearDraftSnapshot();');
    const deleteIndex = block.indexOf('deleteDraftById({ id: draftId })');
    const closeIndex = block.indexOf('onClose?.();');
    expect(markIndex).toBeGreaterThan(-1);
    expect(snapshotIndex).toBeGreaterThan(markIndex);
    expect(deleteIndex).toBeGreaterThan(snapshotIndex);
    expect(closeIndex).toBeGreaterThan(deleteIndex);
  });
});

describe('mod+c r18 — copie du lien de fil', () => {
  it('le handler passe par la garde shouldCopyThreadLink et le lien exact du lecteur', () => {
    expect(threadHotkeys).toContain('shouldCopyThreadLink({');
    expect(threadHotkeys).toContain(
      'buildThreadLink(window.location.origin, folder, openThreadId)',
    );
  });

  it('la ligne du registre ne preventDefault JAMAIS (la copie native garde la main)', () => {
    const rows = keyboardShortcuts.filter((shortcut) => shortcut.action === 'copyThreadLink');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.preventDefault).not.toBe(true);
  });
});
