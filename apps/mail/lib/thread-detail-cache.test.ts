import { hasCompleteThreadBodies } from './thread-detail-cache';
import { describe, expect, it } from 'vitest';

describe('thread detail cache completeness', () => {
  it('rejects a rich list projection cached under the thread detail key', () => {
    expect(
      hasCompleteThreadBodies({
        messages: [{ id: 'm1', body: '', processedHtml: '' }],
      }),
    ).toBe(false);
  });

  it('accepts fetched thread details, including a legitimately empty body', () => {
    expect(hasCompleteThreadBodies({ messages: [{ id: 'm1', decodedBody: '<p>Hello</p>' }] })).toBe(
      true,
    );
    expect(hasCompleteThreadBodies({ messages: [{ id: 'm2', decodedBody: '' }] })).toBe(true);
  });

  it('accepts a draft-only thread without forcing a received-body fetch loop', () => {
    expect(hasCompleteThreadBodies({ messages: [{ id: 'draft', isDraft: true }] })).toBe(true);
  });
});
