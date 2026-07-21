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
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
