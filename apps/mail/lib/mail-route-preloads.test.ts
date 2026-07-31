import {
  collectRouteChunks,
  extractExistingPreloads,
  extractMailRouteModules,
  extractStaticImports,
  injectMailRoutePreloads,
} from '../scripts/mail-route-preloads.mjs';
import { describe, expect, it } from 'vitest';

// r10 : preuve du correctif de la cascade de chunks — le graphe STATIQUE de la
// route mail est préchargé dans le shell mail dédié ; les imports dynamiques
// (surfaces lazy, gate #44) n'entrent jamais dans la fermeture.

describe('extractStaticImports', () => {
  it('capte les deux formes émises par Vite (from"./x.js" et import"./x.js"), dédupliquées', () => {
    const source = 'import{a}from"./chunk-a.js";import"./chunk-b.js";from"./chunk-a.js"';
    expect(extractStaticImports(source).sort()).toEqual(['chunk-a.js', 'chunk-b.js']);
  });

  it('IGNORE les imports dynamiques : les surfaces lazy restent lazy (gate #44)', () => {
    const source = '__vitePreload(()=>import("./composer-lazy.js"),[])';
    expect(extractStaticImports(source)).toEqual([]);
  });
});

describe('collectRouteChunks — fermeture transitive', () => {
  it('suit les imports statiques en profondeur, sans boucle ni doublon', () => {
    const graph: Record<string, string> = {
      'page.js': 'from"./a.js";from"./b.js"',
      'a.js': 'from"./c.js"',
      'b.js': 'from"./c.js"',
      'c.js': 'from"./a.js"', // cycle
    };
    const chunks = collectRouteChunks(['page.js'], (name: string) => graph[name] ?? null);
    expect(chunks.sort()).toEqual(['a.js', 'b.js', 'c.js', 'page.js']);
  });
});

describe('extractMailRouteModules', () => {
  it('extrait layout + [folder]/page du manifest React Router, et rien d’autre', () => {
    const manifest =
      '"(routes)/mail/layout":{"id":"x","module":"/assets/layout-abc.js"},' +
      '"(routes)/mail/[folder]/page":{"id":"y","module":"/assets/page-def.js"},' +
      '"(routes)/settings/page":{"id":"z","module":"/assets/page-zzz.js"}';
    expect(extractMailRouteModules(manifest)).toEqual(['layout-abc.js', 'page-def.js']);
  });
});

describe('injectMailRoutePreloads', () => {
  const html =
    '<html><head><link rel="modulepreload" href="/assets/entry.js"/></head><body></body></html>';

  it('injecte les chunks manquants avant </head> en dédupliquant les préchargés existants', () => {
    const { html: out, injected } = injectMailRoutePreloads(html, ['entry.js', 'route.js']);
    expect(injected).toBe(1);
    expect(out).toContain('<link rel="modulepreload" href="/assets/route.js"/></head>');
    expect(out.match(/href="\/assets\/entry\.js"/g)).toHaveLength(1);
  });

  it('idempotent : une seconde passe n’injecte rien', () => {
    const first = injectMailRoutePreloads(html, ['route.js']);
    const second = injectMailRoutePreloads(first.html, ['route.js']);
    expect(second.injected).toBe(0);
    expect(second.html).toBe(first.html);
  });

  it('sans </head> : HTML inchangé (jamais de corruption)', () => {
    const { html: out, injected } = injectMailRoutePreloads('<html>no-head</html>', ['x.js']);
    expect(injected).toBe(0);
    expect(out).toBe('<html>no-head</html>');
  });

  it('extractExistingPreloads liste les hrefs déjà préchargés', () => {
    expect([...extractExistingPreloads(html)]).toEqual(['/assets/entry.js']);
  });
});
