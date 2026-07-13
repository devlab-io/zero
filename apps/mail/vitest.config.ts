import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mail is a browser app; unit tests run under happy-dom so DOM-dependent tests
// (queue/optimistic UI, keyboard registry — added in later waves) have an
// environment without further config churn. The current queue-view-model test is
// pure logic and passes here too. Include is scoped to the mail source roots.
//
// `@/` alias: the app resolves `@/*` -> `./*` via tsconfig paths (and vite.config for
// the build). vitest does not read vite.config, so the alias is declared here too, or
// any test importing a runtime `@/…` module (e.g. the keyboard-parity coverage test
// importing @/config/shortcuts) fails to resolve. The regex `^@/` is used so scoped
// npm packages (`@tanstack/…`, `@react-email/…`) are left untouched.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    environment: 'happy-dom',
    include: ['{app,components,lib,hooks,store}/**/*.test.{ts,tsx}'],
  },
});
