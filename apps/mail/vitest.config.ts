import { defineConfig } from 'vitest/config';

// Mail is a browser app; unit tests run under happy-dom so DOM-dependent tests
// (queue/optimistic UI, keyboard registry — added in later waves) have an
// environment without further config churn. The current queue-view-model test is
// pure logic and passes here too. Include is scoped to the mail source roots.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['{app,components,lib,hooks,store}/**/*.test.{ts,tsx}'],
  },
});
