import { processEmailHtml } from './email-processor';
import { describe, expect, it } from 'vitest';

describe('processEmailHtml email canvas', () => {
  it('keeps dark sender text readable when the application theme is dark', () => {
    const result = processEmailHtml({
      html: `
        <div style="color: #242424">
          <h1>Votre mot de passe a été modifié</h1>
          <p>Votre mot de passe pour le compte Microsoft a été modifié.</p>
          <a href="https://account.microsoft.com">Vérifiez vos informations</a>
        </div>
      `,
      shouldLoadImages: false,
      theme: 'dark',
    });

    expect(result.processedHtml).toContain('color-scheme: only light');
    expect(result.processedHtml).toContain('background-color: #ffffff');
    expect(result.processedHtml).toContain('color: #1a1a1a');
    expect(result.processedHtml).toContain('style="color:#242424"');
    expect(result.processedHtml).toContain('color: #2563eb');
  });

  it('preserves an email that explicitly defines its own dark surface', () => {
    const result = processEmailHtml({
      html: '<div style="background-color: #111111; color: #f5f5f5">Dark newsletter</div>',
      shouldLoadImages: false,
      theme: 'dark',
    });

    expect(result.processedHtml).toContain('style="background-color:#111111;color:#f5f5f5"');
  });
});
