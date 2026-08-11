import {
  assertMeaningfulEmailBody,
  assertSendableEmail,
  hasMeaningfulEmailBody,
  hasRetaBranding,
  meaningfulEmailText,
  UnsafeEmailContentError,
} from './send-content-guard';
import { describe, expect, it } from 'vitest';

describe('send content guard', () => {
  it.each(['', '   ', '<p><br></p>', '<div>&nbsp;</div>'])(
    'rejects an empty HTML body: %s',
    (body) => expect(hasMeaningfulEmailBody(body)).toBe(false),
  );

  it('rejects the Reta signature when it is the only visible content', () => {
    const signature =
      '<p style="color:#666">Sent via <a href="https://devlab.io/">Reta by Devlab</a></p>';

    expect(meaningfulEmailText(signature)).toBe('');
    expect(() => assertMeaningfulEmailBody(signature)).toThrow(UnsafeEmailContentError);
    expect(hasMeaningfulEmailBody('<p>Reta by Devlab</p>')).toBe(false);
  });

  it('rejects an empty reply even when the generated quote marker follows the signature', () => {
    const reply = `
      <div>
        <p>Sent via <a href="https://devlab.io/">Reta by Devlab</a></p>
        <div>On August 10, Client &lt;client@example.com&gt; wrote:</div>
      </div>`;

    expect(hasMeaningfulEmailBody(reply)).toBe(false);
  });

  it('keeps real prose before the signature', () => {
    const body = '<p>Bonjour Yves, merci pour ton retour.</p><p>Sent via <a>Reta by Devlab</a></p>';

    expect(meaningfulEmailText(body)).toBe('Bonjour Yves, merci pour ton retour.');
    expect(hasRetaBranding(body)).toBe(true);
    expect(() => assertSendableEmail({ body, recipients: ['client@example.com'] })).toThrow(
      /no longer allowed/,
    );
  });

  it('rejects a body without any recipient', () => {
    expect(() => assertSendableEmail({ body: '<p>Bonjour</p>', recipients: [] })).toThrow(
      /no recipient/,
    );
  });
});
