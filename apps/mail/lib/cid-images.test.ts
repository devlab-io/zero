import { resolveCidImages } from './cid-images';
import { describe, expect, it } from 'vitest';

const container = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('resolveCidImages — résolution lazy des images inline', () => {
  it('remplace les refs cid: par des data URIs et ré-affiche les img masquées', () => {
    const root = container(
      '<img src="cid:logo@x" style="display:none"><img src="https://a/b.png">',
    );
    const resolved = resolveCidImages(root, [
      { contentId: 'logo@x', mimeType: 'image/png', body: 'AAAA' },
    ]);
    expect(resolved).toBe(1);
    const imgs = root.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(imgs[0].style.display).toBe('');
    // Les images distantes ne sont jamais touchées.
    expect(imgs[1].getAttribute('src')).toBe('https://a/b.png');
  });

  it('cid inconnu ou corps absent → img laissée telle quelle', () => {
    const root = container('<img src="cid:missing@x"><img src="cid:empty@x">');
    const resolved = resolveCidImages(root, [
      { contentId: 'empty@x', mimeType: 'image/png', body: '' },
      { contentId: null, mimeType: 'image/png', body: 'AAAA' },
    ]);
    expect(resolved).toBe(0);
    const imgs = root.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('cid:missing@x');
    expect(imgs[1].getAttribute('src')).toBe('cid:empty@x');
  });
});
