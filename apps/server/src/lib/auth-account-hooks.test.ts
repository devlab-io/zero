import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const authSource = readFileSync(join(__dirname, 'auth.ts'), 'utf8');
const emailSource = readFileSync(join(__dirname, 'react-emails/email-sequences.tsx'), 'utf8');

describe('Better Auth account hook boundaries', () => {
  it('replays onboarding only for account creation, never incremental OAuth updates', () => {
    const databaseHooks = authSource.slice(authSource.indexOf('databaseHooks:'));

    expect(databaseHooks).toMatch(/create:\s*{\s*after: connectionCreatedHook/);
    expect(databaseHooks).toMatch(/update:\s*{\s*after: connectionHandlerHook/);
    expect(databaseHooks).not.toMatch(/update:\s*{\s*after: connectionCreatedHook/);
  });

  it('provides the React runtime required by the Worker classic JSX transform', () => {
    expect(emailSource).toMatch(/import \* as React from ['"]react['"]/);
  });
});
