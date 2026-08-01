import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), 'utf8');

describe('P11 exact active calendar account mapping', () => {
  it('persists the Better Auth provider account id on the mail connection', () => {
    expect(read('./schema.ts')).toContain("authAccountId: text('auth_account_id')");
    expect(read('../lib/auth.ts')).toContain('authAccountId: account.accountId');
  });

  it('backfills only unambiguous one-account mappings', () => {
    const migration = read('./migrations/0042_public_hellion.sql');
    expect(migration).toContain('ADD COLUMN "auth_account_id"');
    expect(migration).toContain('SELECT count(*)');
    expect(migration).toContain(') = 1');
  });

  it('never substitutes the connection id for the provider account id', () => {
    const route = read('../trpc/routes/meet.ts');
    expect(route).toContain('ctx.activeConnection.authAccountId');
    expect(route).not.toContain('accounts,\n          ctx.activeConnection.id');
  });
});
