import { sanitizeTipTapHtml } from './sanitize-tip-tap-html';
import { describe, expect, it } from 'vitest';

describe('sanitizeTipTapHtml rich replies', () => {
  it('preserves safe quote styling and mail links in the outbound HTML', async () => {
    const { html } = await sanitizeTipTapHtml(
      '<blockquote style="border-left: 3px solid #d1d5db; margin: 12px 0; padding-left: 12px; color: #4b5563;"><p>Texte cité</p></blockquote><p><a href="mailto:alan@devlab.io">Alan</a></p>',
    );

    expect(html).toContain('border-left:3px solid #d1d5db');
    expect(html).toContain('padding-left:12px');
    expect(html).toContain('href="mailto:alan@devlab.io"');
  });
});
