import { isSimpleQueueMessageHtml, queueMessageText } from './queue-thread-message';
import { describe, expect, it } from 'vitest';

describe('queue thread message rendering', () => {
  it('renders plain and lightweight message markup in the native conversation surface', () => {
    expect(isSimpleQueueMessageHtml('Bonjour<br><br>Merci')).toBe(true);
    expect(isSimpleQueueMessageHtml('<p>Bonjour <strong>Thomas</strong></p>')).toBe(true);
    expect(isSimpleQueueMessageHtml('<div dir="ltr">Bonjour<br>Merci</div>')).toBe(true);
  });

  it('keeps rich or styled emails in the hardened HTML renderer', () => {
    expect(isSimpleQueueMessageHtml('<table><tr><td>Newsletter</td></tr></table>')).toBe(false);
    expect(isSimpleQueueMessageHtml('<p style="color:red">Alerte</p>')).toBe(false);
    expect(isSimpleQueueMessageHtml('<img src="https://example.com/a.png">')).toBe(false);
  });

  it('turns simple markup into readable text without injecting HTML', () => {
    expect(queueMessageText('<p>Bonjour&nbsp;Thomas</p><p>Merci &amp; à bientôt</p>')).toBe(
      'Bonjour Thomas\nMerci & à bientôt',
    );
    expect(queueMessageText('<ul><li>Un</li><li>Deux</li></ul>')).toBe('• Un\n• Deux');
  });

  it('does not throw on an invalid numeric entity', () => {
    expect(queueMessageText('Test &#99999999;')).toBe('Test �');
  });
});
