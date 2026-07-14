import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { oauthApplication } from './schema';

describe('oauth application schema', () => {
  it('exposes Better Auth redirectUrls without renaming the existing database column', () => {
    const columns = getTableColumns(oauthApplication);

    expect(columns).toHaveProperty('redirectUrls');
    expect(columns).not.toHaveProperty('redirectURLs');
    expect(columns.redirectUrls.name).toBe('redirect_u_r_ls');
  });
});
