import {
  ASK_RETA_ATTACHMENT_LIMITS,
  extractAskRetaAttachments,
  isAskRetaTextAttachment,
} from './ask-reta-attachments';
import { describe, expect, it, vi } from 'vitest';

describe('Ask Reta attachments', () => {
  it('accepts text-like formats by MIME type or extension', () => {
    expect(isAskRetaTextAttachment(new File(['a'], 'notes.txt', { type: '' }))).toBe(true);
    expect(isAskRetaTextAttachment(new File(['a'], 'table.csv', { type: 'text/csv' }))).toBe(true);
    expect(isAskRetaTextAttachment(new File(['a'], 'scan.pdf', { type: 'application/pdf' }))).toBe(
      false,
    );
  });

  it('normalizes and clamps extracted text', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
    const { accepted, rejected } = await extractAskRetaAttachments([
      new File(['hello\r\nworld\u0000'], 'notes.md', { type: 'text/markdown' }),
    ]);
    expect(rejected).toEqual([]);
    expect(accepted).toEqual([
      expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001', text: 'hello\nworld' }),
    ]);
  });

  it('rejects unsupported and oversized files without reading them', async () => {
    const pdf = new File(['pdf'], 'scan.pdf', { type: 'application/pdf' });
    const oversized = new File(
      [new Uint8Array(ASK_RETA_ATTACHMENT_LIMITS.bytesPerFile + 1)],
      'huge.txt',
      { type: 'text/plain' },
    );
    const { accepted, rejected } = await extractAskRetaAttachments([pdf, oversized]);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([
      { name: 'scan.pdf', reason: 'type' },
      { name: 'huge.txt', reason: 'size' },
    ]);
  });
});
