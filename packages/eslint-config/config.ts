import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.react-router/**',
    '**/.well-known/**',
  ]),
  // @ts-expect-error
  tseslint.configs.recommended,
  //
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooksPlugin.configs['recommended-latest'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Frontière front→serveur (issue #25 / V2.4) : apps/mail ne doit plus tirer les
      // sources serveur via un chemin relatif ; les contrats partagés passent par
      // @zero/types. Le pattern `**/server/src/**` ne matche PAS les sous-chemins
      // publics `@zero/server/*` (auth/schemas/trpc), qui restent autorisés.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/src/**'],
              message:
                'Frontière front→serveur : importez les contrats partagés depuis @zero/types, pas les sources @zero/server via un chemin relatif (issue #25).',
            },
          ],
        },
      ],
    },
  },
]);
