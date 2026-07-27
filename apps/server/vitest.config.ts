import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Server unit tests run in Node: the code under test (draft-outbox state machine,
// mail-sanitize) is pure logic + a pure-JS HTML parser (cheerio/slim). No browser
// DOM and no wrangler-generated types are required.
export default defineConfig({
  resolve: {
    alias: {
      // `cloudflare:workers` is a Workers-runtime builtin, unresolvable in Node.
      'cloudflare:workers': fileURLToPath(
        new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url),
      ),
      // Idem : `agents` importe `EmailMessage` depuis `cloudflare:email` au chargement du
      // module. Nécessaire depuis que routes/agent/agent-tenancy.test.ts monte la VRAIE
      // chaîne de routage des agents.
      'cloudflare:email': fileURLToPath(
        new URL('./tests/stubs/cloudflare-email.ts', import.meta.url),
      ),
    },
  },
  test: {
    // `agents` et `partyserver` sont transformés par vite au lieu d'être externalisés :
    // c'est la seule façon d'appliquer les alias `cloudflare:*` ci-dessus À L'INTÉRIEUR de
    // ces paquets, et donc de faire tourner en Node la vraie `AIChatAgent` et le vrai
    // `routeAgentRequest` (preuve de cloisonnement multi-locataire).
    server: { deps: { inline: ['agents', 'partyserver'] } },
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
