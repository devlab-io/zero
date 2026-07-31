import {
  collectRouteChunks,
  extractExistingPreloads,
  extractMailRouteModules,
  extractStaticImports,
  injectMailRoutePreloads,
  MAX_INJECTED_PRELOADS,
  MAX_MAIL_PRELOADS,
  selectMailPreloadChunks,
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

describe('selectMailPreloadChunks — cut-set critique borné (r11)', () => {
  const graph: Record<string, string> = {
    'layout.js': 'from"./big-a.js";from"./small.js";from"./big-b.js"',
    'page.js': 'from"./big-b.js";from"./big-c.js";from"./tiny.js"',
    // niveau 2 : jamais préchargé
    'big-a.js': 'from"./level2.js"',
  };
  const sizes: Record<string, number> = {
    'layout.js': 40_000,
    'page.js': 30_000,
    'big-a.js': 90_000,
    'big-b.js': 80_000,
    'big-c.js': 50_000,
    'small.js': 9_000,
    'tiny.js': 1_000,
    'level2.js': 200_000,
  };
  const read = (name: string) => graph[name] ?? null;
  const size = (name: string) => sizes[name] ?? null;

  it('les entrées de route sont TOUJOURS incluses, en tête', () => {
    const chunks = selectMailPreloadChunks(['layout.js', 'page.js'], read, size);
    expect(chunks.slice(0, 2)).toEqual(['layout.js', 'page.js']);
  });

  it('imports DIRECTS triés par taille décroissante, sous le budget de nombre', () => {
    const chunks = selectMailPreloadChunks(['layout.js', 'page.js'], read, size, {
      maxPreloads: 4,
    });
    // 2 entrées + 2 plus lourds du niveau 1 : big-a (90k), big-b (80k).
    expect(chunks).toEqual(['layout.js', 'page.js', 'big-a.js', 'big-b.js']);
  });

  it('le NIVEAU 2 (level2.js, 200k) n’est JAMAIS préchargé — pas de fermeture entière', () => {
    const chunks = selectMailPreloadChunks(['layout.js', 'page.js'], read, size);
    expect(chunks).not.toContain('level2.js');
  });

  it('les chunks sous MIN_PRELOAD_BYTES sont écartés (le coût requête dépasse le gain)', () => {
    const chunks = selectMailPreloadChunks(['layout.js', 'page.js'], read, size);
    expect(chunks).not.toContain('tiny.js');
    expect(chunks).toContain('small.js'); // 9k ≥ 8k : gardé
  });

  it('budget global : jamais plus de MAX_MAIL_PRELOADS chunks au total', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`c${i}.js`, '']),
    ) as Record<string, string>;
    wide['entry.js'] = Array.from({ length: 60 }, (_, i) => `from"./c${i}.js"`).join(';');
    const chunks = selectMailPreloadChunks(
      ['entry.js'],
      (n: string) => wide[n] ?? null,
      () => 50_000,
    );
    expect(chunks.length).toBeLessThanOrEqual(MAX_MAIL_PRELOADS);
    expect(chunks[0]).toBe('entry.js');
  });

  it('déterministe : deux appels identiques → même liste', () => {
    const a = selectMailPreloadChunks(['layout.js', 'page.js'], read, size);
    const b = selectMailPreloadChunks(['layout.js', 'page.js'], read, size);
    expect(a).toEqual(b);
  });
});

describe('injectMailRoutePreloads — budgets durs (r13)', () => {
  const bare = '<html><head></head><body></body></html>';

  it('jamais plus de MAX_INJECTED_PRELOADS liens injectés', () => {
    const names = Array.from({ length: 15 }, (_, i) => `c${i}.js`);
    const { injected } = injectMailRoutePreloads(bare, names);
    expect(injected).toBe(MAX_INJECTED_PRELOADS);
  });

  it('budget gzip : un chunk qui dépasserait le total est SAUTÉ, un plus petit suivant peut entrer', () => {
    const sizes: Record<string, number> = { 'a.js': 60_000, 'b.js': 60_000, 'c.js': 20_000 };
    const { injected, injectedBytes, html } = injectMailRoutePreloads(
      bare,
      ['a.js', 'b.js', 'c.js'],
      { sizeOf: (n: string) => sizes[n] ?? 0 },
    );
    expect(injected).toBe(2); // a (60k) + c (20k) ; b ferait dépasser 90 KiB
    expect(injectedBytes).toBe(80_000);
    expect(html).toContain('/assets/a.js');
    expect(html).not.toContain('/assets/b.js');
    expect(html).toContain('/assets/c.js');
  });

  it('l’ordre du sélecteur est respecté : les entrées de route passent en premier sous le budget', () => {
    const { html } = injectMailRoutePreloads(bare, ['entry.js', 'x.js'], {
      maxCount: 1,
    });
    expect(html).toContain('/assets/entry.js');
    expect(html).not.toContain('/assets/x.js');
  });
});
