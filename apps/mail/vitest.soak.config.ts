import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Dedicated config for the 30-minute robustness soak (issue #34, check point 8).
// The spec lives at scripts/soak-robustness.ts — deliberately NOT matching the
// normal `*.test.ts` include, so `vitest run` (the CI gate) never runs it. Invoke
// explicitly: `vitest run --config apps/mail/vitest.soak.config.ts`.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    environment: 'happy-dom',
    include: ['scripts/soak-robustness.ts'],
    // 30 min soak + generous margin; hooks likewise.
    testTimeout: 45 * 60 * 1000,
    hookTimeout: 45 * 60 * 1000,
  },
});
