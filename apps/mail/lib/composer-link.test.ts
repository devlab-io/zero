import { normalizeComposerLink } from './composer-link';
import { describe, expect, it } from 'vitest';

describe('normalizeComposerLink', () => {
  it('adds safe schemes to domains and email addresses', () => {
    expect(normalizeComposerLink('devlab.io/offres')).toBe('https://devlab.io/offres');
    expect(normalizeComposerLink('contact@devlab.io')).toBe('mailto:contact@devlab.io');
  });

  it('keeps supported schemes and rejects executable or malformed values', () => {
    expect(normalizeComposerLink('https://devlab.io')).toBe('https://devlab.io');
    expect(normalizeComposerLink('tel:+68940123456')).toBe('tel:+68940123456');
    expect(normalizeComposerLink('javascript:alert(1)')).toBeNull();
    expect(normalizeComposerLink('not a link')).toBeNull();
  });
});
