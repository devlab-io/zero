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

// r17 : réparation de contraste contextuelle. Cas prod : « Récap Kura
// fournisseurs — 31/07/2026 » — texte blanc inline authoré pour un client
// sombre, sans fond explicite → blanc-sur-blanc sur notre canevas light
// (correctif Microsoft conservé). Un texte clair n'est réécrit que si son
// contexte de fond effectif est clair ; jamais d'override global.
describe('processEmailHtml — réparation de contraste contextuelle (r17)', () => {
  const render = (html: string) =>
    processEmailHtml({ html, shouldLoadImages: true, theme: 'light' }).processedHtml;

  it('texte blanc sans fond explicite (cas Kura) → réécrit en sombre lisible', () => {
    const processed = render(
      '<div style="color: #ffffff"><p style="color:#fff">Envoyé vers Kura: 0 facture.</p></div>',
    );
    expect(processed).toContain(
      '<div style="color:#1a1a1a"><p style="color:#1a1a1a">Envoyé vers Kura: 0 facture.</p></div>',
    );
  });

  it('quasi-blanc sur fond explicitement blanc → réécrit en sombre', () => {
    const processed = render(
      '<table style="background-color:#ffffff"><tr><td style="color:#f7f7f7">Comptes scannés</td></tr></table>',
    );
    expect(processed).toContain('color:#1a1a1a');
    expect(processed).not.toContain('#f7f7f7');
  });

  it('texte blanc DANS un fond ancêtre sombre → strictement inchangé', () => {
    const processed = render(
      '<div style="background-color:#111111"><p style="color:#ffffff">Dark hero</p></div>',
    );
    expect(processed).toContain('style="color:#ffffff"');
  });

  it('racine réellement sombre (bgcolor legacy) + texte blanc profond → inchangé', () => {
    const processed = render(
      '<table bgcolor="#0b0b0b"><tr><td><span style="color:#fafafa">Newsletter sombre</span></td></tr></table>',
    );
    expect(processed).toContain('style="color:#fafafa"');
  });

  it('texte sombre normal et gris volontairement atténué → jamais touchés', () => {
    const processed = render(
      '<p style="color:#242424">Microsoft</p><p style="color:#999999">Mention légale atténuée</p>',
    );
    expect(processed).toContain('style="color:#242424"');
    expect(processed).toContain('style="color:#999999"');
  });

  it('sections imbriquées : le fond explicite le PLUS PROCHE arbitre chaque texte', () => {
    const processed = render(
      `<div>
        <section style="background-color:#101010">
          <p style="color:#ffffff">hero sombre — conservé</p>
          <div style="background-color:#ffffff">
            <p style="color:#ffffff">carte claire dans le sombre — réparé</p>
          </div>
        </section>
        <section>
          <p style="color:#fefefe">retour au canevas implicite — réparé</p>
        </section>
      </div>`,
    );
    expect(processed).toContain('hero sombre');
    expect(processed).toMatch(/color:#ffffff">hero sombre/);
    expect(processed).toMatch(/color:#1a1a1a">carte claire/);
    expect(processed).toMatch(/color:#1a1a1a">retour au canevas/);
  });

  it('attribut legacy bgcolor clair → contexte clair, texte blanc réparé', () => {
    const processed = render(
      '<table bgcolor="#FFFFFF"><tr><td style="color:#ffffff">invisible</td></tr></table>',
    );
    expect(processed).toContain('color:#1a1a1a');
  });

  it('notation rgb() blanche → réparée ; couleur non interprétable → conservée', () => {
    const processed = render(
      '<p style="color: rgb(255, 255, 255)">rgb blanc</p><p style="color: var(--brand)">variable</p>',
    );
    expect(processed).toMatch(/color:\s*#1a1a1a">rgb blanc/);
    expect(processed).toContain('color:var(--brand)');
  });

  it('fond non interprétable (image/gradient) → conservateur, texte clair conservé', () => {
    const processed = render(
      '<div style="background: url(https://x.co/hero.png)"><p style="color:#ffffff">sur image</p></div>' +
        '<div style="background: linear-gradient(#000, #222)"><p style="color:#ffffff">sur gradient</p></div>',
    );
    expect(processed).toMatch(/color:#ffffff">sur image/);
    expect(processed).toMatch(/color:#ffffff">sur gradient/);
  });

  it('!important est préservé sur la déclaration réparée', () => {
    const processed = render('<p style="color:#ffffff !important">urgent</p>');
    expect(processed).toContain('color:#1a1a1a !important');
  });

  it('fond raccourci `background` avec couleur sombre → texte blanc conservé', () => {
    const processed = render(
      '<div style="background:#1f2937"><p style="color:#ffffff">bouton</p></div>',
    );
    expect(processed).toMatch(/color:#ffffff">bouton/);
  });

  it('héritage (revue r17) : parent clair réparé, la couleur ORIGINALE est matérialisée dans le sous-arbre sombre', () => {
    const processed = render(
      '<div style="color:#fff">texte clair à réparer <div style="background:#111">texte blanc hérité à préserver</div></div>',
    );
    // Le parent devient lisible sur le canevas clair…
    expect(processed).toContain('<div style="color:#1a1a1a">texte clair à réparer');
    // …et le descendant sombre SANS couleur propre récupère le blanc d'auteur :
    // il n'hérite jamais du #1a1a1a réparé (qui serait sombre-sur-sombre).
    expect(processed).toContain(
      '<div style="background:#111;color:#fff">texte blanc hérité à préserver</div>',
    );
  });

  it('héritage inverse : section claire SANS couleur propre sous un ancêtre sombre au texte blanc → réparée localement', () => {
    const processed = render(
      '<div style="background:#111111;color:#ffffff">ok sombre <div style="background-color:#ffffff">hérité blanc sur blanc</div></div>',
    );
    // L'ancêtre sombre garde son blanc intact…
    expect(processed).toContain('style="background:#111111;color:#ffffff"');
    // …la section claire reçoit une couleur lisible SANS toucher l'ancêtre.
    expect(processed).toContain(
      '<div style="background-color:#ffffff;color:#1a1a1a">hérité blanc sur blanc</div>',
    );
  });
});
