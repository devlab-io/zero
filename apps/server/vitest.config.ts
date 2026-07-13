import { defineConfig } from 'vitest/config';

// Server unit tests run in Node: the code under test (draft-outbox state machine,
// mail-sanitize) is pure logic + a pure-JS HTML parser (cheerio/slim). No browser
// DOM and no wrangler-generated types are required.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
