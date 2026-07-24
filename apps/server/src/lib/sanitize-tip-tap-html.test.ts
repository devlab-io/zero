import { sanitizeTipTapHtml, wrapInEmailDocument } from './sanitize-tip-tap-html';
import { describe, expect, it } from 'vitest';

// Verrou de non-régression du remplacement de react-email par un gabarit
// littéral (perf : −2,9 Mio de graphe statique côté Worker). La forme de
// référence ci-dessous a été capturée sur l'implémentation d'origine
// (`render(<Html><div dangerouslySetInnerHTML …/></Html>)`), aux trois
// marqueurs de flux React près, volontairement omis.
const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

describe('wrapInEmailDocument', () => {
  it('reproduit le document que produisait react-email', () => {
    expect(wrapInEmailDocument('<p>Bonjour</p>')).toBe(
      `${DOCTYPE}<html dir="ltr" lang="en"><head></head><div><p>Bonjour</p></div></html>`,
    );
  });

  it('insère le contenu verbatim, sans échappement (parité avec dangerouslySetInnerHTML)', () => {
    const inner = '<strong>Thomas</strong> & <em>Mathilde</em>';
    expect(wrapInEmailDocument(inner)).toContain(`<div>${inner}</div>`);
  });
});

describe('sanitizeTipTapHtml', () => {
  it('extrait les images base64 en pièces liées par cid et les retire du corps', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { html, inlineImages } = await sanitizeTipTapHtml(
      `<p>Voici</p><img src="data:image/png;base64,${png}" alt="pixel" />`,
    );

    expect(inlineImages).toHaveLength(1);
    expect(inlineImages[0].mimeType).toBe('image/png');
    expect(inlineImages[0].data).toBe(png);
    expect(inlineImages[0].cid).toMatch(/^image_[0-9a-f-]+@0\.email$/);

    // Le corps référence la pièce, plus la donnée base64.
    expect(html).toContain(`src="cid:${inlineImages[0].cid}"`);
    expect(html).not.toContain('base64');
    expect(html.startsWith(DOCTYPE)).toBe(true);
  });

  it('assainit les balises et attributs hors liste blanche', async () => {
    const { html } = await sanitizeTipTapHtml(
      '<p onclick="steal()">Salut</p><script>alert(1)</script>',
    );

    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).toContain('<p>Salut</p>');
  });

  it("ne produit aucune pièce liée quand le corps est dépourvu d'images", async () => {
    const { html, inlineImages } = await sanitizeTipTapHtml('<p>Texte simple</p>');
    expect(inlineImages).toEqual([]);
    expect(html).toBe(
      `${DOCTYPE}<html dir="ltr" lang="en"><head></head><div><p>Texte simple</p></div></html>`,
    );
  });
});
