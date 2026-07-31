import {
  selectThreadShellRow,
  selectThreadViewState,
  shouldMarkThreadShellReady,
} from './thread-view-state';
import { describe, expect, it } from 'vitest';

// Issue #34, check point 3 (barème A9): a failed thread fetch shows a FINITE
// error (retry/back), never an endless skeleton.

describe('selectThreadViewState', () => {
  const base = {
    hasSelection: true,
    hasData: false,
    isLoading: false,
    isError: false,
    isOffline: false,
  };

  it('no selection → no-selection', () => {
    expect(selectThreadViewState({ ...base, hasSelection: false })).toBe('no-selection');
  });

  it('data present → ready', () => {
    expect(selectThreadViewState({ ...base, hasData: true })).toBe('ready');
  });

  it('active-thread 500/offline with no data → error (not a skeleton)', () => {
    expect(selectThreadViewState({ ...base, isError: true })).toBe('error');
    expect(selectThreadViewState({ ...base, isOffline: true })).toBe('error');
  });

  it('genuinely loading with no data → loading', () => {
    expect(selectThreadViewState({ ...base, isLoading: true })).toBe('loading');
  });

  it('resolved without data (not loading, not error) → error, never an endless skeleton', () => {
    expect(selectThreadViewState({ ...base })).toBe('error');
  });

  it('a failed fetch never resolves to loading (the endless-skeleton bug)', () => {
    // isLoading false + isError true is exactly the state that produced the old
    // perpetual skeleton; it must be a finite error now.
    expect(selectThreadViewState({ ...base, isLoading: false, isError: true })).not.toBe('loading');
  });
});

describe('selectThreadShellRow — shell optimiste d’ouverture (CUA échecs 3-4)', () => {
  const rich = { id: 't1', subject: 'Relevé BDT', sender: { email: 'a@b.pf' } };
  const thin = { id: 't2' };

  it('ligne riche trouvée → shell (sujet/expéditeur peints avant le corps)', () => {
    expect(selectThreadShellRow([thin, rich], 't1')).toBe(rich);
  });

  it('ligne mince (recherche Gmail, pas de sujet) → pas de shell, squelette seul', () => {
    expect(selectThreadShellRow([thin, rich], 't2')).toBeUndefined();
  });

  it('fil hors liste ou sans sélection → pas de shell', () => {
    expect(selectThreadShellRow([rich], 'absent')).toBeUndefined();
    expect(selectThreadShellRow([rich], null)).toBeUndefined();
  });
});

describe('shouldMarkThreadShellReady — jalon « ouverture perçue » (r7b)', () => {
  const rich = { id: 't1', subject: 'Relevé BDT' };
  const base = {
    threadState: 'loading' as const,
    threadId: 't1',
    shellRow: rich,
    lastMarkedId: null,
  };

  it('shell réellement peint (ligne riche, corps en vol) → marque', () => {
    expect(shouldMarkThreadShellReady(base)).toBe(true);
  });

  it('SANS shell row (squelette nu : ligne mince ou fil hors liste) → JAMAIS de marque', () => {
    // Marquer ici déclarerait à tort la cible <300 ms « shell projection peint ».
    expect(shouldMarkThreadShellReady({ ...base, shellRow: undefined })).toBe(false);
  });

  it('hors chargement (ready/error/no-selection) → pas de marque', () => {
    expect(shouldMarkThreadShellReady({ ...base, threadState: 'ready' })).toBe(false);
    expect(shouldMarkThreadShellReady({ ...base, threadState: 'error' })).toBe(false);
    expect(
      shouldMarkThreadShellReady({ ...base, threadState: 'no-selection', threadId: null }),
    ).toBe(false);
  });

  it('une seule marque par fil ; un nouveau fil re-marque', () => {
    expect(shouldMarkThreadShellReady({ ...base, lastMarkedId: 't1' })).toBe(false);
    expect(shouldMarkThreadShellReady({ ...base, lastMarkedId: 't0' })).toBe(true);
  });
});
