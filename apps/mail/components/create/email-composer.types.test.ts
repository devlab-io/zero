import {
  hasMeaningfulComposerMessage,
  schema,
  shouldFinalizeComposerSend,
} from './email-composer.types';
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

describe('composer message safety', () => {
  it.each(['', ' ', '<p><br></p>', '<div>&nbsp;</div>'])(
    'rejects empty editor HTML: %s',
    (message) => {
      expect(hasMeaningfulComposerMessage(message)).toBe(false);
      expect(
        schema.safeParse({ to: ['client@example.com'], subject: 'Subject', message }).success,
      ).toBe(false);
    },
  );

  it('accepts visible prose', () => {
    expect(hasMeaningfulComposerMessage('<p>Bonjour Yves, merci.</p>')).toBe(true);
  });
});
