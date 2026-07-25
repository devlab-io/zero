import { describe, expect, it } from 'vitest';

import { applyEmailPreferences, preprocessEmailHtml, processEmailHtml } from './email-processor';

// Audit CRITIQUE (axe Sécurité) : HTML d'email non fiable injecté dans le shadow root sans filtrage
// de l'attribut `style`. Ces tests prouvent que le repli choisi (allowedStyles sanitize-html +
// extension du blocage d'images aux backgrounds CSS) ferme la surface concrète citée par l'audit :
// overlay via position:fixed/z-index, et tracking/exfil via url() — sans casser le rendu légitime.

describe('preprocessEmailHtml — filtrage de l’attribut style', () => {
  it('retire position/z-index/inset (surface de clickjacking en overlay)', () => {
    const hostile =
      '<div style="position:fixed;z-index:999999;top:0;left:0;width:100vw;height:100vh;color:red;">boo</div>';
    const out = preprocessEmailHtml(hostile);
    expect(out).not.toMatch(/position\s*:/i);
    expect(out).not.toMatch(/z-index/i);
    expect(out).not.toMatch(/top\s*:/i);
    expect(out).not.toMatch(/left\s*:/i);
    // La propriété autorisée voisine doit survivre — on ne sur-filtre pas.
    expect(out).toMatch(/color\s*:\s*red/i);
  });

  it('interdit url() sur une propriété autorisée qui ne relève pas de l’image (list-style)', () => {
    const hostile =
      '<div style="list-style: url(https://evil.tld/bullet.png); color:blue;">x</div>';
    const out = preprocessEmailHtml(hostile);
    expect(out).not.toMatch(/list-style/i);
    expect(out).toMatch(/color\s*:\s*blue/i);
  });

  it('interdit expression()/javascript: (vecteurs legacy) sur une propriété autorisée', () => {
    const hostile = '<div style="width: expression(alert(1)); color:green;">x</div>';
    const out = preprocessEmailHtml(hostile);
    expect(out).not.toMatch(/expression/i);
    expect(out).toMatch(/color\s*:\s*green/i);
  });

  it('laisse passer un style légitime inchangé', () => {
    const legit = '<p style="color:red;font-size:14px;text-align:center;">hello</p>';
    const out = preprocessEmailHtml(legit);
    expect(out).toContain('color:red');
    expect(out).toContain('font-size:14px');
    expect(out).toContain('text-align:center');
  });

  it('autorise structurellement background-image (géré ensuite par la préférence images)', () => {
    const html = '<div style="background-image:url(https://example.com/hero.png);">x</div>';
    const out = preprocessEmailHtml(html);
    expect(out).toMatch(/background-image/i);
  });

  it('bloque un background-image en url(javascript:...) même structurellement', () => {
    const hostile = '<div style="background-image:url(javascript:alert(1));">x</div>';
    const out = preprocessEmailHtml(hostile);
    expect(out).not.toMatch(/javascript:/i);
  });
});

describe('applyEmailPreferences — blocage des images de fond distantes', () => {
  it('bloque un background-image distant en style="" et le compte dans hasBlockedImages', () => {
    const preprocessed =
      '<div style="background-image:url(https://evil.tld/track.gif);color:red;">payload</div>';
    const { processedHtml, hasBlockedImages } = applyEmailPreferences(preprocessed, 'light', false);
    expect(hasBlockedImages).toBe(true);
    expect(processedHtml).not.toContain('evil.tld');
    // Le reste du style (non lié à l'image) doit survivre.
    expect(processedHtml).toMatch(/color\s*:\s*red/i);
  });

  it('bloque le raccourci background: url(...) distant', () => {
    const preprocessed =
      '<div style="background: url(https://evil.tld/pixel.gif) no-repeat;">x</div>';
    const { processedHtml, hasBlockedImages } = applyEmailPreferences(preprocessed, 'light', false);
    expect(hasBlockedImages).toBe(true);
    expect(processedHtml).not.toContain('evil.tld');
  });

  it('laisse passer un background-image cid: (pièce jointe inline), cohérent avec <img src="cid:">', () => {
    const preprocessed = '<div style="background-image:url(cid:logo123);">x</div>';
    const { processedHtml, hasBlockedImages } = applyEmailPreferences(preprocessed, 'light', false);
    expect(hasBlockedImages).toBe(false);
    expect(processedHtml).toContain('cid:logo123');
  });

  it('autorise le background-image distant quand shouldLoadImages est vrai (expéditeur de confiance)', () => {
    const preprocessed = '<div style="background-image:url(https://example.com/hero.png);">x</div>';
    const { processedHtml, hasBlockedImages } = applyEmailPreferences(preprocessed, 'light', true);
    expect(hasBlockedImages).toBe(false);
    expect(processedHtml).toContain('https://example.com/hero.png');
  });

  it('conserve le comportement existant de blocage des <img> distantes', () => {
    const preprocessed = '<img src="https://evil.tld/x.png" alt="x" />';
    const { processedHtml, hasBlockedImages } = applyEmailPreferences(preprocessed, 'light', false);
    expect(hasBlockedImages).toBe(true);
    // Le <img> réel est remplacé par un <span> inerte ; seule une trace en commentaire HTML
    // (jamais rendue ni fetchée) subsiste — comportement préexistant, pas une régression.
    expect(processedHtml).not.toMatch(/<img[^>]*evil\.tld/i);
  });
});

describe('processEmailHtml — pipeline complet (payload hostile combiné)', () => {
  it('un email avec overlay + tracking pixel CSS ressort sans position/z-index/url() et compte le blocage', () => {
    const hostile = `
      <div style="position:fixed;z-index:999999;top:0;left:0;width:100vw;height:100vh;background-image:url(https://evil.tld/pixel.gif);">
        <p style="color:red;">Contenu piégé</p>
      </div>
    `;
    const { processedHtml, hasBlockedImages } = processEmailHtml({
      html: hostile,
      shouldLoadImages: false,
      theme: 'light',
    });

    expect(processedHtml).not.toMatch(/position\s*:\s*fixed/i);
    expect(processedHtml).not.toMatch(/z-index/i);
    expect(processedHtml).not.toContain('evil.tld');
    expect(hasBlockedImages).toBe(true);
    expect(processedHtml).toMatch(/color\s*:\s*red/i);
  });
});

describe('blocs <style> — filtre maison (la dépendance ne sait pas restreindre)', () => {
  it('retire un overlay posé par une règle de feuille de style', () => {
    const out = processEmailHtml({
      html: '<style>.x{position:fixed;top:0;z-index:999999;color:red}</style><div class="x">hameçon</div>',
      shouldLoadImages: false,
      theme: 'light',
    });

    expect(out.processedHtml).not.toContain('position');
    expect(out.processedHtml).not.toContain('z-index');
    // la déclaration légitime de la même règle survit
    expect(out.processedHtml).toContain('color');
  });

  it('retire les at-rules, dont @import qui charge du CSS distant', () => {
    const out = processEmailHtml({
      html: "<style>@import url('https://evil.test/x.css');.y{color:blue}</style><p>hi</p>",
      shouldLoadImages: false,
      theme: 'light',
    });

    expect(out.processedHtml).not.toContain('@import');
    expect(out.processedHtml).not.toContain('evil.test');
  });

  it('laisse passer une feuille de style légitime', () => {
    const out = processEmailHtml({
      html: '<style>.card{color:#333;padding:8px;text-align:center}</style><div class="card">ok</div>',
      shouldLoadImages: false,
      theme: 'light',
    });

    expect(out.processedHtml).toContain('padding');
    expect(out.processedHtml).toContain('text-align');
  });

  it('refuse url() dans une propriété non-background au sein d’un bloc', () => {
    const out = processEmailHtml({
      html: '<style>.z{color:red;list-style-image:url(https://evil.test/p.gif)}</style><ul class="z"><li>x</li></ul>',
      shouldLoadImages: true,
      theme: 'light',
    });

    expect(out.processedHtml).not.toContain('evil.test');
  });
});
