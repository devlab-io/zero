import { shouldFetchMessageAttachments } from './use-attachments';
import { describe, expect, it } from 'vitest';

describe('shouldFetchMessageAttachments', () => {
  it('skips the network for messages with no attachment metadata', () => {
    expect(shouldFetchMessageAttachments()).toBe(false);
    expect(shouldFetchMessageAttachments([])).toBe(false);
    expect(shouldFetchMessageAttachments([{ attachmentId: '' }])).toBe(false);
  });

  it('fetches bodies only when at least one attachment id exists', () => {
    expect(shouldFetchMessageAttachments([{ attachmentId: 'att-1' }])).toBe(true);
  });
});
