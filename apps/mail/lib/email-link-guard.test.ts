import { describe, expect, it } from 'vitest';

import { resolveEmailLinkClick } from './email-link-guard';

/** Monte un fragment de mail dans un shadow root, comme le fait mail-content.tsx. */
const mount = (html: string) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = html;
  return root;
};

const clickTargetIn = (root: ShadowRoot, selector: string) => {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`selector not found: ${selector}`);
  return element;
};

describe('resolveEmailLinkClick — clic sur un ENFANT du lien', () => {
  it('intercepte un clic sur un <b> imbriqué dans le lien', () => {
    const root = mount('<a href="https://example.test/x"><b id="bold">Cliquez</b></a>');
    expect(resolveEmailLinkClick(clickTargetIn(root, '#bold'))).toEqual({
      kind: 'external',
      href: 'https://example.test/x',
    });
  });

  it('intercepte un clic sur un <img> imbriqué dans le lien', () => {
    const root = mount('<a href="https://example.test/y"><img id="pix" src="x.png"></a>');
    expect(resolveEmailLinkClick(clickTargetIn(root, '#pix'))).toMatchObject({ kind: 'external' });
  });

  it('intercepte un clic profondément imbriqué (span > b > i)', () => {
    const root = mount(
      '<a href="https://example.test/z"><span><b><i id="deep">go</i></b></span></a>',
    );
    expect(resolveEmailLinkClick(clickTargetIn(root, '#deep'))).toMatchObject({ kind: 'external' });
  });

  it('ne fait rien quand le clic est hors de tout lien', () => {
    const root = mount('<p id="text">pas un lien</p><a href="https://example.test">lien</a>');
    expect(resolveEmailLinkClick(clickTargetIn(root, '#text'))).toBeNull();
  });

  it('ne fait rien sur une cible qui n’est pas un élément', () => {
    expect(resolveEmailLinkClick(null)).toBeNull();
    expect(resolveEmailLinkClick({} as EventTarget)).toBeNull();
  });
});

describe('resolveEmailLinkClick — schémas autorisés', () => {
  it('autorise http et https, quelle que soit la casse', () => {
    for (const href of ['http://a.test/', 'https://a.test/', 'HTTPS://a.test/']) {
      const root = mount(`<a id="l" href="${href}">x</a>`);
      expect(resolveEmailLinkClick(clickTargetIn(root, '#l'))).toEqual({ kind: 'external', href });
    }
  });

  it('autorise mailto', () => {
    const root = mount('<a id="l" href="mailto:someone@example.test">x</a>');
    expect(resolveEmailLinkClick(clickTargetIn(root, '#l'))).toEqual({
      kind: 'mailto',
      href: 'mailto:someone@example.test',
    });
  });

  it('bloque javascript:, data:, blob:, file: et les schémas maquillés', () => {
    const hostile = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'blob:https://a.test/abc',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
    ];

    for (const href of hostile) {
      const root = mount('<a id="l">x</a>');
      // `setAttribute` plutôt que l'interpolation : les guillemets et retours à la ligne des
      // charges hostiles doivent arriver intacts dans l'attribut.
      clickTargetIn(root, '#l').setAttribute('href', href);
      expect(resolveEmailLinkClick(clickTargetIn(root, '#l'))).toEqual({
        kind: 'blocked',
        href: href.trim(),
      });
    }
  });

  it('bloque une navigation relative, qui remplacerait l’application', () => {
    const root = mount('<a id="l" href="/settings">x</a>');
    expect(resolveEmailLinkClick(clickTargetIn(root, '#l'))).toMatchObject({ kind: 'blocked' });
  });

  it('bloque un lien sans href plutôt que de le laisser passer', () => {
    const root = mount('<a id="l">x</a>');
    expect(resolveEmailLinkClick(clickTargetIn(root, '#l'))).toEqual({ kind: 'blocked', href: '' });
  });

  it('un target="_self" ne change rien : l’action reste décidée par le schéma', () => {
    const root = mount('<a id="l" target="_self" href="https://a.test/"><b id="b">x</b></a>');
    expect(resolveEmailLinkClick(clickTargetIn(root, '#b'))).toMatchObject({ kind: 'external' });
  });
});
