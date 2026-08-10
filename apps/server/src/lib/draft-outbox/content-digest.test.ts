import { createDraftContentDigest } from './index';
import { describe, expect, it } from 'vitest';

describe('draft content digest', () => {
  it('treats the React Email provider envelope as the same body', async () => {
    const body = '<p>Bonjour</p><p>À bientôt,<br>Thomas</p>';
    const providerBody =
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html dir="ltr" lang="en"><head></head><!--$--><div><p>Bonjour</p><p>À bientôt,<br />Thomas</p></div><!--1--><!--/$--></html>';

    await expect(createDraftContentDigest({ body: providerBody })).resolves.toBe(
      await createDraftContentDigest({ body }),
    );

    const bodyWithUserDiv = '<div><p>Bonjour</p></div>';
    const wrappedUserDiv =
      '<!DOCTYPE html><html><head></head><!--$--><div><div><p>Bonjour</p></div></div><!--/$--></html>';
    await expect(createDraftContentDigest({ body: wrappedUserDiv })).resolves.toBe(
      await createDraftContentDigest({ body: bodyWithUserDiv }),
    );
  });

  it('normalizes provider address formatting without hiding content changes', async () => {
    const plain = await createDraftContentDigest({
      to: ['thomas@example.com'],
      subject: 'Sujet',
      body: '<p>Version A</p>',
    });
    const provider = await createDraftContentDigest({
      to: ['Thomas <THOMAS@example.com>'],
      subject: ' Sujet ',
      body: '<p>Version A</p>',
    });
    const changed = await createDraftContentDigest({
      to: ['thomas@example.com'],
      subject: 'Sujet',
      body: '<p>Version B</p>',
    });

    expect(provider).toBe(plain);
    expect(changed).not.toBe(plain);
  });
});
