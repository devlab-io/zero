import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
  // #44 (gate A8): the palette-split contract tests render real source components (which use the
  // automatic JSX runtime, without importing React). Match that in the test transform so those
  // components don't fail with "React is not defined". Build/runtime are unaffected by this.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    environment: 'happy-dom',
    include: ['{app,components,lib,hooks,providers,store,workers}/**/*.test.{ts,tsx}'],
  },
});
