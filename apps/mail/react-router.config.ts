import type { Config } from '@react-router/dev/config';

export default {
  ssr: false,
  buildDirectory: 'build',
  appDirectory: 'app',
  routeDiscovery: {
    mode: 'initial',
  },
  // w2cd (client weight): prerender the landing shell. With ssr:false the '/' route is
  // rendered at build time to a static index.html carrying only the root layout +
  // HydrateFallback (no landing-route data — clientLoader runs at hydration), giving a
  // fast neutral first paint. Cloudflare not_found_handling:single-page-application then
  // serves that same neutral shell for deep-links (e.g. /mail/inbox) — verified by
  // wrangler dev + curl that the deep-link is NOT served landing content.
  prerender: ['/manifest.webmanifest', '/'],
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
