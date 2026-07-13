import { describe, expect, it } from 'vitest';
import { selectThreadViewState } from './thread-view-state';

// Issue #34, check point 3 (barème A9): a failed thread fetch shows a FINITE
// error (retry/back), never an endless skeleton.

describe('selectThreadViewState', () => {
  const base = { hasSelection: true, hasData: false, isLoading: false, isError: false, isOffline: false };

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
