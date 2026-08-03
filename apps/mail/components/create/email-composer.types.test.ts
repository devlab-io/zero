import { shouldFinalizeComposerSend } from './email-composer.types';
import { describe, expect, it } from 'vitest';

describe('shouldFinalizeComposerSend', () => {
  it('keeps the draft intact when the host rejects the enqueue', () => {
    expect(shouldFinalizeComposerSend(false)).toBe(false);
  });

  it('finalizes both explicit and legacy successful enqueue outcomes', () => {
    expect(shouldFinalizeComposerSend(true)).toBe(true);
    expect(shouldFinalizeComposerSend(undefined)).toBe(true);
  });
});
